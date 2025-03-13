import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { join } from 'node:path';
import { logger } from '../../../lib/logger';
import { BaseScraper } from './base';
import { FRAMEWORK_REGISTRY } from '../registry';

/**
 * Generic scraper for any framework's documentation
 * 
 * This serves as a fallback when no specialized scraper exists
 */
export class GenericScraper extends BaseScraper {
  /**
   * Fetch documentation for any framework
   */
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo || !frameworkInfo.docsUrl) {
      throw new Error(`Missing configuration for ${framework}`);
    }

    logger.info(`Starting generic documentation scraping for ${framework}`, { version });
    const savedFiles: string[] = [];
    const browser = await this.createBrowser();
    const visitedUrls = new Set<string>();

    try {
      const page = await browser.newPage();
      
      // Set a reasonable viewport
      await page.setViewport({ width: 1280, height: 800 });
      
      // Disable images, fonts, and CSS to speed up crawling
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (
          request.resourceType() === 'image' || 
          request.resourceType() === 'font' ||
          request.resourceType() === 'stylesheet'
        ) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Starting URL
      const baseUrl = frameworkInfo.docsUrl;
      const baseUrlObj = new URL(baseUrl);
      
      // Queue to track URLs to visit
      const urlQueue: string[] = [baseUrl];
      
      // Track visited URLs to avoid duplicates
      visitedUrls.add(baseUrl);
      
      // Maximum number of pages to scrape
      const maxPages = 50;
      
      // Start crawling
      while (urlQueue.length > 0 && savedFiles.length < maxPages) {
        const currentUrl = urlQueue.shift()!;
        
        try {
          // Navigate to the page
          await this.navigateWithRetry(page, currentUrl);
          logger.debug(`Processing page: ${currentUrl}`);
          
          // Get the page content
          const content = await page.content();
          
          // Extract and clean the content
          const { title, content: cleanContent } = this.extractMainContent(content);
          
          // Create a filename from the URL
          const urlObj = new URL(currentUrl);
          const path = urlObj.pathname;
          
          // Create a safe filename
          const filename = path
            .replace(/^\//, '')
            .replace(/\/$/, '')
            .replace(/\//g, '_')
            .replace(/[^\w\-._]/g, '_');
            
          const filePath = join(outputDir, `${filename || 'index'}.html`);
          
          // Save the content
          await this.saveToFile(filePath, cleanContent);
          savedFiles.push(filePath);
          
          logger.debug(`Saved content from ${currentUrl} to ${filePath}`);
          
          // Extract more links to follow
          if (savedFiles.length < maxPages) {
            // Find links on the current page
            const links = await page.evaluate(() => {
              const pageLinks: string[] = [];
              document.querySelectorAll('a').forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                  pageLinks.push(href);
                }
              });
              return pageLinks;
            });
            
            // Process and filter links
            for (const link of links) {
              try {
                // Skip fragment links and already visited links
                if (link.startsWith('#')) continue;
                
                // Construct absolute URL
                let absoluteUrl: string;
                try {
                  absoluteUrl = new URL(link, currentUrl).href;
                } catch (e) {
                  continue; // Skip invalid URLs
                }
                
                // Only follow links to the same domain and not already visited
                const linkUrl = new URL(absoluteUrl);
                if (
                  linkUrl.hostname === baseUrlObj.hostname && 
                  !visitedUrls.has(absoluteUrl) &&
                  !absoluteUrl.includes('#') && // Skip fragment identifiers
                  !absoluteUrl.includes('twitter.com') && // Skip social links
                  !absoluteUrl.includes('github.com') &&
                  !absoluteUrl.endsWith('.pdf') && // Skip file downloads
                  !absoluteUrl.endsWith('.zip') &&
                  !absoluteUrl.endsWith('.tar.gz')
                ) {
                  urlQueue.push(absoluteUrl);
                  visitedUrls.add(absoluteUrl);
                }
              } catch (error) {
                logger.debug(`Skipping invalid link: ${link}`);
              }
            }
          }
        } catch (error) {
          logger.error(`Failed to process URL ${currentUrl}`, { error: error.message });
        }
      }
      
      logger.info(`Completed generic documentation scraping for ${framework} with ${savedFiles.length} files`);
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}