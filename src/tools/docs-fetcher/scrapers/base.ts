import puppeteer from 'puppeteer';
import { logger } from '../../../lib/logger';
import { config } from '../../../lib/config';

/**
 * Base interface for all documentation scrapers
 */
export interface DocsScraper {
  fetchDocs(framework: string, version: string, outputDir: string, maxPages?: number): Promise<string[]>;
}

/**
 * Base scraper with common functionality
 */
export abstract class BaseScraper implements DocsScraper {
  /**
   * Main method to fetch documentation
   */
  abstract fetchDocs(framework: string, version: string, outputDir: string, maxPages?: number): Promise<string[]>;

  /**
   * Create a new browser instance with the configured options
   */
  protected async createBrowser() {
    logger.info(`Launching browser with timeout ${config.PUPPETEER_TIMEOUT || 60000}ms`);
    
    try {
      // Add more stability options to ensure clean browser operation
      const browser = await puppeteer.launch({
        headless: 'new',
        timeout: config.PUPPETEER_TIMEOUT || 60000,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-translate',
          '--disable-notifications',
          '--disable-infobars',
          '--window-size=1366,768',
          '--single-process', // Less resource usage
          '--no-zygote'       // More stability
        ],
        // Set a reasonable default viewport
        defaultViewport: {
          width: 1366,
          height: 768
        },
        // Increase browser stability
        ignoreHTTPSErrors: true,
        handleSIGINT: true,
        handleSIGTERM: true,
        handleSIGHUP: true,
      });
      
      // Set up clean termination handling
      process.on('SIGINT', async () => {
        logger.info('SIGINT received, closing browser');
        await browser.close();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, closing browser');
        await browser.close();
        process.exit(0);
      });
      
      logger.info('Browser launched successfully');
      return browser;
    } catch (error) {
      logger.error('Failed to launch browser', { error: error.message });
      throw error;
    }
  }

  /**
   * Navigate to a page with retry mechanism and rate limiting
   */
  protected async navigateWithRetry(page: puppeteer.Page, url: string): Promise<void> {
    const maxRetries = 3;
    const timeout = config.PUPPETEER_TIMEOUT || 60000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Log navigation attempt
        logger.info(`Navigating to ${url} (attempt ${attempt}/${maxRetries})`);
        
        // Navigate to page with timeout
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout
        });
        
        // Wait for some content to load
        await Promise.race([
          page.waitForSelector('h1, h2, p, .content, article, main', { timeout: 5000 }),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        
        // Check for rate limiting by looking for common indicators
        const isRateLimited = await page.evaluate(() => {
          const body = document.body.textContent?.toLowerCase() || '';
          return body.includes('rate limit') || 
                 body.includes('too many requests') || 
                 body.includes('try again later') ||
                 body.includes('rate exceeded');
        });
        
        if (isRateLimited) {
          logger.warn(`Rate limit detected on ${url}`);
          
          if (attempt < maxRetries) {
            // Exponential backoff
            const backoffTime = 30000 * Math.pow(2, attempt - 1); // 30s, 60s, 120s...
            logger.info(`Backing off for ${backoffTime/1000}s before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          }
        }
        
        logger.info(`Successfully loaded ${url}`);
        return;
      } catch (error) {
        logger.warn(`Navigation attempt ${attempt} failed for ${url}`, { error: error.message });
        
        if (attempt < maxRetries) {
          // Simple exponential backoff
          const backoff = 2000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
  }
}