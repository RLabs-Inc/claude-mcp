import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { join } from 'node:path';
import { logger } from '../../../lib/logger';
import { BaseScraper } from './base';
import { FRAMEWORK_REGISTRY } from '../registry';

/**
 * Specialized scraper for FastAPI documentation
 */
export class FastAPIScraper extends BaseScraper {
  /**
   * Fetch FastAPI documentation
   */
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo || !frameworkInfo.docsUrl) {
      throw new Error(`Missing configuration for ${framework}`);
    }

    logger.info(`Starting FastAPI documentation scraping`, { version });
    const savedFiles: string[] = [];
    const browser = await this.createBrowser();

    try {
      const page = await browser.newPage();
      
      // Set a reasonable viewport
      await page.setViewport({ width: 1280, height: 800 });
      
      // Navigate to the main page
      await this.navigateWithRetry(page, frameworkInfo.docsUrl);
      logger.info(`Navigated to main documentation page: ${frameworkInfo.docsUrl}`);
      
      // Wait for the documentation structure to load
      await page.waitForSelector('.md-nav__list', { timeout: 10000 });
      
      // Extract all links from the navigation
      const docLinks = await page.evaluate(() => {
        const links: string[] = [];
        // Fast API uses MkDocs, which has a specific structure
        document.querySelectorAll('.md-nav__link').forEach(link => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('http') && !links.includes(href) && !href.includes('#')) {
            links.push(href);
          }
        });
        return links;
      });
      
      logger.info(`Found ${docLinks.length} documentation links`);
      
      // Process each link (limit to 50 for now to avoid excessive scraping)
      const linksToProcess = docLinks.slice(0, 50);
      
      for (const link of linksToProcess) {
        try {
          // Construct full URL
          const url = new URL(link.startsWith('http') ? link : link, frameworkInfo.docsUrl).href;
          
          // Navigate to the page
          await this.navigateWithRetry(page, url);
          logger.debug(`Processing page: ${url}`);
          
          // Wait for content to load
          await page.waitForSelector('.md-content', { timeout: 10000 });
          
          // Get the page content
          const content = await page.content();
          
          // Extract the main content (MkDocs stores the main content in .md-content)
          const $ = cheerio.load(content);
          const mainContent = $('.md-content').html() || '';
          const title = $('h1').first().text().trim() || 
                        $('title').text().trim().replace(' - FastAPI', '') || 
                        'Untitled';
          
          // Create a safe filename from the link
          const filename = link
            .replace(/^\//, '')
            .replace(/\//g, '_')
            .replace(/[^\w\-._]/g, '_');
            
          const filePath = join(outputDir, `${filename || 'index'}.html`);
          
          // Save the content with title and body
          const fullContent = `
            <h1>${title}</h1>
            ${mainContent}
          `;
          
          await this.saveToFile(filePath, fullContent);
          savedFiles.push(filePath);
          
          logger.debug(`Saved content from ${link} to ${filePath}`);
        } catch (error) {
          logger.error(`Failed to process link ${link}`, { error: error.message });
        }
      }
      
      logger.info(`Completed FastAPI documentation scraping with ${savedFiles.length} files`);
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}