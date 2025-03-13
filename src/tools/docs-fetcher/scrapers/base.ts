import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../../lib/logger';
import { config } from '../../../lib/config';

/**
 * Base interface for all documentation scrapers
 */
export interface DocsScraper {
  fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]>;
}

/**
 * Base scraper with common functionality for all scrapers
 */
export abstract class BaseScraper implements DocsScraper {
  /**
   * The maximum number of retries for failed requests
   */
  protected maxRetries: number = 3;
  
  /**
   * Delay between retries in milliseconds
   */
  protected retryDelay: number = 1000;

  /**
   * Main method to fetch documentation
   */
  abstract fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]>;

  /**
   * Create a new browser instance with the configured options
   */
  protected async createBrowser() {
    return puppeteer.launch({
      headless: config.PUPPETEER_HEADLESS ? 'new' : false,
      timeout: config.PUPPETEER_TIMEOUT,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  /**
   * Fetch a URL with retry mechanism
   */
  protected async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        if (response.ok) {
          return response;
        }
        
        lastError = new Error(`HTTP error: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;
        logger.warn(`Fetch attempt ${attempt} failed for ${url}`, { error: error.message });
      }
      
      // If we've reached the max retries, don't wait
      if (attempt < this.maxRetries) {
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Navigate to a page with retry mechanism
   */
  protected async navigateWithRetry(page: puppeteer.Page, url: string): Promise<void> {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: config.PUPPETEER_TIMEOUT
        });
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Navigation attempt ${attempt} failed for ${url}`, { error: error.message });
      }
      
      // If we've reached the max retries, don't wait
      if (attempt < this.maxRetries) {
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Save content to a file and handle directories
   */
  protected async saveToFile(filePath: string, content: string): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dir = join(filePath, '..');
      await mkdir(dir, { recursive: true });
      
      // Save content
      await writeFile(filePath, content);
    } catch (error) {
      logger.error(`Failed to save content to ${filePath}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up HTML by removing unnecessary elements
   */
  protected cleanHtml(html: string): string {
    const $ = cheerio.load(html);
    
    // Remove unnecessary elements
    $('script, style, iframe, noscript').remove();
    
    // Remove common navigation and non-content elements
    $('.navigation, .sidebar, .nav, .menu, .footer, .header, nav, footer, header').remove();
    
    // Return clean HTML
    return $.html();
  }

  /**
   * Extract the main content from a page
   */
  protected extractMainContent(html: string): { title: string, content: string } {
    const $ = cheerio.load(html);
    
    // Try to find the title
    const title = $('h1').first().text().trim() || 
                 $('title').text().trim() || 
                 'Untitled';
    
    // Try to find the main content
    let mainContent = $('main, article, .content, .documentation, .docs-content, .markdown-body').first();
    
    // If no specialized content area is found, use the body as fallback
    if (!mainContent.length) {
      mainContent = $('body');
    }
    
    return {
      title,
      content: mainContent.html() || ''
    };
  }
}