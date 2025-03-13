import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { join } from 'node:path';
import { logger } from '../../../lib/logger';
import { BaseScraper } from './base';
import { FRAMEWORK_REGISTRY } from '../registry';

/**
 * Specialized scraper for LangChain documentation
 */
export class LangChainScraper extends BaseScraper {
  /**
   * Fetch LangChain documentation
   */
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo || !frameworkInfo.docsUrl) {
      throw new Error(`Missing configuration for ${framework}`);
    }

    logger.info(`Starting LangChain documentation scraping`, { version });
    const savedFiles: string[] = [];
    const browser = await this.createBrowser();

    try {
      const page = await browser.newPage();
      
      // Set a reasonable viewport
      await page.setViewport({ width: 1280, height: 800 });
      
      // 1. First scrape the main documentation
      if (frameworkInfo.docsUrl) {
        await this.navigateWithRetry(page, frameworkInfo.docsUrl);
        logger.info(`Navigated to main documentation page: ${frameworkInfo.docsUrl}`);
        
        // Wait for the page to be fully loaded
        await page.waitForSelector('nav', { timeout: 10000 });
        
        // Extract all section links from the sidebar
        const sectionLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('nav a').forEach(link => {
            const href = link.getAttribute('href');
            // Only include documentation links (not external links)
            if (href && href.startsWith('/docs/') && !links.includes(href)) {
              links.push(href);
            }
          });
          return links;
        });
        
        logger.info(`Found ${sectionLinks.length} documentation links`);
        
        // Create directories for main docs
        const mainDocsDir = join(outputDir, 'main');
        
        // Process each link (limit to 50 for now to avoid excessive scraping)
        const linksToProcess = sectionLinks.slice(0, 50);
        
        for (const link of linksToProcess) {
          try {
            // Construct full URL
            const url = new URL(link.startsWith('http') ? link : link, frameworkInfo.docsUrl).href;
            
            // Navigate to the page
            await this.navigateWithRetry(page, url);
            logger.debug(`Processing page: ${url}`);
            
            // Get the page content
            const content = await page.content();
            
            // Extract and clean the content
            const { title, content: cleanContent } = this.extractMainContent(content);
            
            // Create a safe filename from the link
            const filename = link
              .replace(/^\/docs\//, '')
              .replace(/\//g, '_')
              .replace(/[^\w\-._]/g, '_') + '.html';
              
            const filePath = join(mainDocsDir, filename);
            
            // Save the content
            await this.saveToFile(filePath, cleanContent);
            savedFiles.push(filePath);
            
            logger.debug(`Saved content from ${link} to ${filePath}`);
          } catch (error) {
            logger.error(`Failed to process link ${link}`, { error: error.message });
          }
        }
      }
      
      // 2. If there's an API documentation URL, process it too
      if (frameworkInfo.apiDocsUrl) {
        logger.info(`Processing API documentation: ${frameworkInfo.apiDocsUrl}`);
        
        await this.navigateWithRetry(page, frameworkInfo.apiDocsUrl);
        
        // Extract links from the API docs
        const apiLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.includes('#') && !links.includes(href)) {
              links.push(href);
            }
          });
          return links;
        });
        
        logger.info(`Found ${apiLinks.length} API documentation links`);
        
        // Create directory for API docs
        const apiDocsDir = join(outputDir, 'api');
        
        // Process API links (limit to 50)
        const apiLinksToProcess = apiLinks.slice(0, 50);
        
        for (const link of apiLinksToProcess) {
          try {
            // Construct full URL
            const url = new URL(link.startsWith('http') ? link : link, frameworkInfo.apiDocsUrl).href;
            
            // Navigate to the page
            await this.navigateWithRetry(page, url);
            
            // Get the page content
            const content = await page.content();
            
            // Extract main content
            const { title, content: cleanContent } = this.extractMainContent(content);
            
            // Create a safe filename
            const filename = link
              .replace(/^\//, '')
              .replace(/\//g, '_')
              .replace(/[^\w\-._]/g, '_') + '.html';
              
            const filePath = join(apiDocsDir, filename);
            
            // Save the content
            await this.saveToFile(filePath, cleanContent);
            savedFiles.push(filePath);
            
            logger.debug(`Saved API content from ${link} to ${filePath}`);
          } catch (error) {
            logger.error(`Failed to process API link ${link}`, { error: error.message });
          }
        }
      }
      
      logger.info(`Completed LangChain documentation scraping with ${savedFiles.length} files`);
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}