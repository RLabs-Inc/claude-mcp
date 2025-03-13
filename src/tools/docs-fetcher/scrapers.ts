import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FRAMEWORK_REGISTRY } from './registry';
import { logger } from '../../lib/logger';
import { config } from '../../lib/config';

/**
 * Base interface for all documentation scrapers
 */
interface DocsScraper {
  fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]>;
}

/**
 * Scraper for fetching LangChain Python documentation
 */
export class LangChainScraper implements DocsScraper {
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const savedFiles: string[] = [];
    
    try {
      console.log(`Fetching LangChain documentation from ${frameworkInfo.docsUrl}`);
      
      // First, scrape the main documentation
      if (frameworkInfo.docsUrl) {
        await page.goto(frameworkInfo.docsUrl, { waitUntil: 'networkidle2' });
        
        // Get all section links from the sidebar
        const sectionLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('nav a').forEach(link => {
            if (link.getAttribute('href')?.startsWith('/docs/') && !links.includes(link.getAttribute('href') || '')) {
              links.push(link.getAttribute('href') || '');
            }
          });
          return links;
        });
        
        console.log(`Found ${sectionLinks.length} section links`);
        
        // Create base directory
        const baseDir = join(outputDir, 'docs');
        await mkdir(baseDir, { recursive: true });
        
        // Scrape each section
        for (const link of sectionLinks.slice(0, 10)) { // Limit to first 10 for testing
          try {
            const url = new URL(link, frameworkInfo.docsUrl).href;
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            // Get the page content
            const content = await page.content();
            
            // Extract the main content using Cheerio
            const $ = cheerio.load(content);
            const mainContent = $('main').html() || '';
            const title = $('h1').first().text() || link.split('/').pop() || 'untitled';
            
            // Create filename from the link
            const filename = link.replace(/^\/docs\//, '').replace(/\//g, '_') + '.html';
            const filePath = join(baseDir, filename);
            
            // Save the content
            await writeFile(filePath, mainContent);
            savedFiles.push(filePath);
            
            console.log(`Saved ${link} to ${filePath}`);
          } catch (error) {
            console.error(`Error fetching ${link}:`, error);
          }
        }
      }
      
      // Second, scrape the API documentation if available
      if (frameworkInfo.apiDocsUrl) {
        await page.goto(frameworkInfo.apiDocsUrl, { waitUntil: 'networkidle2' });
        
        // Get all API section links
        const apiLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !links.includes(href) && !href.includes('#')) {
              links.push(href);
            }
          });
          return links;
        });
        
        console.log(`Found ${apiLinks.length} API documentation links`);
        
        // Create API directory
        const apiDir = join(outputDir, 'api');
        await mkdir(apiDir, { recursive: true });
        
        // Scrape each API section
        for (const link of apiLinks.slice(0, 10)) { // Limit to first 10 for testing
          try {
            const url = new URL(link, frameworkInfo.apiDocsUrl).href;
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            // Get the page content
            const content = await page.content();
            
            // Create filename from the link
            const filename = link.replace(/\//g, '_') + '.html';
            const filePath = join(apiDir, filename);
            
            // Save the content
            await writeFile(filePath, content);
            savedFiles.push(filePath);
            
            console.log(`Saved API ${link} to ${filePath}`);
          } catch (error) {
            console.error(`Error fetching API ${link}:`, error);
          }
        }
      }
      
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}

/**
 * Scraper for FastAPI documentation
 */
export class FastAPIScraper implements DocsScraper {
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const savedFiles: string[] = [];
    
    try {
      console.log(`Fetching FastAPI documentation from ${frameworkInfo.docsUrl}`);
      
      // Go to the main page
      await page.goto(frameworkInfo.docsUrl, { waitUntil: 'networkidle2' });
      
      // Get all section links from the sidebar
      const sectionLinks = await page.evaluate(() => {
        const links: string[] = [];
        document.querySelectorAll('.md-nav__link').forEach(link => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('http') && !links.includes(href)) {
            links.push(href);
          }
        });
        return links;
      });
      
      console.log(`Found ${sectionLinks.length} FastAPI documentation links`);
      
      // Create docs directory
      await mkdir(outputDir, { recursive: true });
      
      // Scrape each section
      for (const link of sectionLinks.slice(0, 20)) { // Limit to first 20 for testing
        try {
          const url = new URL(link, frameworkInfo.docsUrl).href;
          await page.goto(url, { waitUntil: 'networkidle2' });
          
          // Get the page content
          const content = await page.content();
          
          // Extract the main content using Cheerio
          const $ = cheerio.load(content);
          const mainContent = $('.md-content').html() || '';
          const title = $('h1').first().text() || link.split('/').pop() || 'untitled';
          
          // Create filename from the link
          const filename = link.replace(/\//g, '_') + '.html';
          const filePath = join(outputDir, filename);
          
          // Save the content
          await writeFile(filePath, mainContent);
          savedFiles.push(filePath);
          
          console.log(`Saved ${link} to ${filePath}`);
        } catch (error) {
          console.error(`Error fetching ${link}:`, error);
        }
      }
      
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}

/**
 * Factory function to get the appropriate scraper for a framework
 */
export function getScraperForFramework(framework: string): DocsScraper {
  const frameworkLower = framework.toLowerCase();
  
  if (frameworkLower === 'langchain') {
    return new LangChainScraper();
  } else if (frameworkLower === 'fastapi') {
    return new FastAPIScraper();
  } else {
    throw new Error(`No specialized scraper available for ${framework}`);
  }
}

/**
 * Generic scraper that can be used for any framework
 */
export class GenericScraper implements DocsScraper {
  async fetchDocs(framework: string, version: string, outputDir: string): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const savedFiles: string[] = [];
    
    try {
      if (!frameworkInfo.docsUrl) {
        throw new Error(`No documentation URL defined for ${framework}`);
      }
      
      console.log(`Fetching documentation for ${framework} from ${frameworkInfo.docsUrl}`);
      
      // Go to the main documentation page
      await page.goto(frameworkInfo.docsUrl, { waitUntil: 'networkidle2' });
      
      // Get all links on the page
      const links = await page.evaluate((baseUrl) => {
        const allLinks: string[] = [];
        document.querySelectorAll('a').forEach(link => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('#') && 
              !href.includes('twitter.com') && !href.includes('github.com')) {
            // Make relative URLs absolute
            const absoluteUrl = new URL(href, baseUrl).href;
            if (absoluteUrl.startsWith(baseUrl) && !allLinks.includes(absoluteUrl)) {
              allLinks.push(absoluteUrl);
            }
          }
        });
        return allLinks;
      }, frameworkInfo.docsUrl);
      
      console.log(`Found ${links.length} links to scrape`);
      
      // Create docs directory
      await mkdir(outputDir, { recursive: true });
      
      // Scrape each page (limiting to 30 pages for now)
      for (const url of links.slice(0, 30)) {
        try {
          await page.goto(url, { waitUntil: 'networkidle2' });
          
          // Get the page content
          const content = await page.content();
          
          // Parse out the path to create a filename
          const urlObj = new URL(url);
          const path = urlObj.pathname;
          
          // Create a safe filename
          const filename = path
            .replace(/^\//, '')                 // Remove leading slash
            .replace(/\/$/, '')                 // Remove trailing slash
            .replace(/\//g, '_')                // Replace slashes with underscores
            .replace(/[^a-zA-Z0-9_\-.]/g, '_'); // Replace any other invalid chars
          
          // Add .html extension if not already present
          const fullFilename = filename.endsWith('.html') ? filename : `${filename || 'index'}.html`;
          const filePath = join(outputDir, fullFilename);
          
          // Save the content
          await writeFile(filePath, content);
          savedFiles.push(filePath);
          
          console.log(`Saved ${url} to ${filePath}`);
        } catch (error) {
          console.error(`Error fetching ${url}:`, error);
        }
      }
      
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
}