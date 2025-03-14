import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { logger } from '../../../lib/logger';
import { BaseScraper } from './base';
import { FRAMEWORK_REGISTRY } from '../registry';

/**
 * Intelligent documentation scraper that automatically discovers content
 * 
 * This scraper can handle any documentation site without hardcoding paths
 * by intelligently discovering and prioritizing documentation links
 */
export class GenericScraper extends BaseScraper {
  /**
   * Configuration for the scraper
   */
  private config = {
    // Patterns to identify documentation pages by URL
    docUrlPatterns: [
      '/docs/', '/documentation/', '/guide/', '/api/', '/reference/',
      '/manual/', '/tutorial/', '/learn/', '/examples/', '/get-started/',
      '/components/', '/modules/', '/packages/', '/concepts/', '/basics/',
      '/advanced/', '/resources/', '/contributing/', '/specification/'
    ],
    
    // Keywords to identify documentation links by text
    docLinkKeywords: [
      'documentation', 'docs', 'guide', 'tutorial', 'api', 'reference',
      'manual', 'examples', 'quickstart', 'getting started', 'learn',
      'components', 'modules', 'concepts', 'introduction', 'overview',
      'basics', 'advanced', 'usage', 'setup', 'installation', 'configuration',
      'hooks', 'function', 'method', 'class', 'interface', 'type'
    ],
    
    // Elements to remove (noise)
    removeSelectors: [
      // Interactive elements
      'script', 'style', 'iframe', 'noscript',
      
      // Navigation elements - more selective to keep useful navigation
      'nav.navbar', 'header:not(:has(h1)):not(:has(h2))', 'footer', '.cookie-banner',
      
      // UI elements
      '.search', '.edit-page', '.feedback', '.announcement',
      '.pagination-nav', '.ads', '.banner', '.cookie-notice',
      
      // Social/external links
      '.social-links', '.share-links', '.social-share',
      '.github-link', '.twitter-link'
    ],
    
    // Link patterns to ignore when crawling
    ignoreLinkPatterns: [
      // External sites - except allow links to GitHub docs or examples
      /twitter\.com/, /facebook\.com/, /linkedin\.com/,
      /youtube\.com/, /vimeo\.com/, /medium\.com/, /stackoverflow\.com/,
      
      // File downloads
      /\.zip$/, /\.tar\.gz$/, /\.png$/, /\.jpg$/, /\.jpeg$/,
      
      // Auth/API endpoints (not documentation)
      /\/login/, /\/logout/, /\/signin/, /\/signup/, /\/auth/,
      /\/graphql/, /\/webhooks/,
      
      // Common non-documentation paths
      /\/blog/, /\/news/, /\/about/, /\/contact/, /\/pricing/,
      /\/careers/, /\/jobs/, /\/press/, /\/legal/,
      
      // Search & filters
      /\/search\?/, /\?q=/, /\?search=/, /\?filter=/,
      
      // Language specific paths - only allow English content
      /\/[a-z]{2}\/(?!en)/, // Match two-letter language codes except 'en'
      /\/(?!en)[a-z]{2}\//, // Also match when language code is at start
      /\/translations\//, // Common path for translations
      // Common non-English paths in documentation 
      /\/az\//, /\/bn\//, /\/es\//, /\/fr\//, /\/de\//, /\/it\//, 
      /\/ja\//, /\/ko\//, /\/pt\//, /\/ru\//, /\/zh\//
    ],
    
    // Maximum crawl depth from home page - increased to go deeper
    maxDepth: 7,
    
    // Use a hybrid approach - prioritize first by importance, then by depth
    breadthFirst: false
  };
  
  /**
   * Fetch documentation for any framework
   */
  async fetchDocs(framework: string, version: string, outputDir: string, maxPages: number = 50): Promise<string[]> {
    const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
    if (!frameworkInfo || !frameworkInfo.docsUrl) {
      throw new Error(`Missing configuration for ${framework}`);
    }

    logger.info(`Starting documentation scraping for ${framework}`, { version });
    
    // Save framework-specific sections if available (for prioritization)
    const knownSections = frameworkInfo.docsSections || [];
    const baseUrl = frameworkInfo.docsUrl;
    const urlObj = new URL(baseUrl);
    const domain = urlObj.hostname;
    
    const browser = await this.createBrowser();
    const savedFiles: string[] = [];
    
    try {
      // Create main content directory
      await mkdir(outputDir, { recursive: true });
      logger.info(`Created output directory: ${outputDir}`);
      
      // Create a page object
      const page = await browser.newPage();
      
      // Optimize for speed by blocking unnecessary resources
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (['image', 'font', 'stylesheet', 'media'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Set a reasonable viewport size
      await page.setViewport({ width: 1366, height: 768 });
      
      // Tracking crawled pages
      const crawledPages = new Set<string>();
      
      // Queue of pages to crawl with their depth
      const queue: Array<{ url: string; depth: number; priority: number }> = [{ 
        url: baseUrl, 
        depth: 0,
        priority: 100  // Start page has highest priority
      }];
      
      // Page priority scoring function for better results
      const calculateLinkPriority = (url: string, linkText: string, fromDepth: number): number => {
        // Base priority - not as strongly affected by depth
        // We want to explore deeper pages better
        let priority = Math.max(50, 100 - fromDepth * 10);
        
        // URLs that match documentation patterns get a big boost
        if (this.config.docUrlPatterns.some(pattern => url.includes(pattern))) {
          priority += 80; // Higher boost to encourage exploring docs deeper
        }
        
        // Path segments priority - don't penalize deeper paths as much
        const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
        
        // API reference pages are often deeper but very important
        const isApiOrReference = url.includes('/api/') || 
                                url.includes('/reference/') || 
                                pathSegments.includes('api') || 
                                pathSegments.includes('reference');
        
        if (isApiOrReference) {
          priority += 100; // Maximum priority for API docs
        }
        
        // Links with documentation keywords get a boost
        const linkTextLower = linkText.toLowerCase();
        if (this.config.docLinkKeywords.some(keyword => linkTextLower.includes(keyword))) {
          priority += 50; // Increased boost
        }
        
        // Boost for framework-specific known sections
        if (knownSections.some(section => {
          // More flexible matching for sections
          return url.includes(`/${section}/`) || 
                 pathSegments.includes(section) ||
                 url.endsWith(`/${section}`);
        })) {
          priority += 70;
        }
        
        // Specific documentation pattern matching
        if (
          // Common documentation path patterns
          /\/(docs|guide|tutorial|examples)\//.test(url) ||
          // Common API patterns
          /\/(api|reference)\//.test(url) ||
          // Common component/module patterns
          /\/(components|modules|packages)\//.test(url)
        ) {
          priority += 60;
        }
        
        // Deprioritize URLs with query parameters
        if (url.includes('?')) {
          priority -= 20;
        }
        
        // Handle fragment links better - some docs use them for navigation
        if (url.includes('#')) {
          // Only moderately deprioritize fragments that look like section IDs
          const fragment = url.split('#')[1];
          if (fragment && (fragment.length < 30 && !/^\d+$/.test(fragment))) {
            priority -= 10; // Less penalty for potentially useful fragments
          } else {
            priority -= 30; // Bigger penalty for other fragments
          }
        }
        
        return priority;
      };
      
      // Helper function to extract links from a page
      const extractLinks = async (currentUrl: string, depth: number): Promise<Array<{ url: string; priority: number }>> => {
        try {
          const links: Array<{ url: string; priority: number }> = [];
          const processedUrls = new Set<string>();
          
          // Extract all links on the page
          const extractedLinks = await page.evaluate((domain) => {
            const allLinks = document.querySelectorAll('a[href]');
            return Array.from(allLinks).map(link => {
              const href = link.getAttribute('href');
              if (!href) return null;
              
              try {
                // Convert to absolute URL
                const url = new URL(href, window.location.href);
                
                // Only keep links to the same domain
                if (url.hostname !== domain) return null;
                
                return {
                  url: url.href,
                  text: link.textContent?.trim() || '',
                  // Track these for better prioritization
                  inNavigation: !!(
                    link.closest('nav') || 
                    link.closest('.sidebar') || 
                    link.closest('.menu') || 
                    link.closest('.toc')
                  ),
                  inContent: !!(
                    link.closest('main') || 
                    link.closest('article') || 
                    link.closest('.content') || 
                    link.closest('.section')
                  )
                };
              } catch (e) {
                return null;
              }
            }).filter(Boolean);
          }, domain);
          
          // Process the extracted links
          for (const link of extractedLinks) {
            // Skip if already processed in this extraction
            if (processedUrls.has(link.url)) continue;
            processedUrls.add(link.url);
            
            // Skip links matching ignore patterns
            if (this.config.ignoreLinkPatterns.some(pattern => 
              typeof pattern === 'string' ? link.url.includes(pattern) : pattern.test(link.url)
            )) {
              continue;
            }
            
            // Calculate priority for this link
            let priority = calculateLinkPriority(link.url, link.text, depth);
            
            // Boost links in navigation
            if (link.inNavigation) priority += 15;
            
            // Also boost links in main content
            if (link.inContent) priority += 10;
            
            links.push({ url: link.url, priority });
          }
          
          return links;
        } catch (error) {
          logger.error(`Error extracting links from ${currentUrl}`, { error: error.message });
          return [];
        }
      };
      
      // Helper function to process a page
      const processPage = async (url: string, depth: number): Promise<void> => {
        // Skip already crawled pages and enforce strict page limit
        if (crawledPages.has(url)) return;
        if (savedFiles.length >= maxPages) return;
        
        // Skip non-English content based on URL patterns
        const nonEnglishPatterns = [
          /\/[a-z]{2}\/(?!en)/, // Match two-letter language codes except 'en'
          /\/(?!en)[a-z]{2}\//, // Also match when language code is at start
          /\/translations\//, 
          /\/az\//, /\/bn\//, /\/es\//, /\/fr\//, /\/de\//, /\/it\//, 
          /\/ja\//, /\/ko\//, /\/pt\//, /\/ru\//, /\/zh\//
        ];
        
        if (nonEnglishPatterns.some(pattern => pattern.test(url))) {
          logger.debug(`Skipping non-English content: ${url}`);
          return;
        }
        
        // Skip fragment URLs that often cause issues
        if (url.includes('#')) {
          // Only process fragment URLs if they seem to be important API references
          const isApiFragment = url.includes('/api/') || 
                               url.includes('/reference/') ||
                               /\/\w+\/\w+#\w+/.test(url);
                               
          if (!isApiFragment) {
            logger.debug(`Skipping fragment URL: ${url}`);
            return;
          }
        }
        
        try {
          logger.info(`Processing page ${savedFiles.length + 1}/${maxPages}: ${url} (depth: ${depth})`);
          
          // Stop processing if we've reached the page limit
          if (savedFiles.length >= maxPages) {
            logger.info(`Reached maximum pages limit of ${maxPages}. Stopping.`);
            return;
          }
          
          // Navigate to the page
          await this.navigateWithRetry(page, url);
          crawledPages.add(url); // Mark as visited even if processing fails
          
          // Get and clean content
          const pageContent = await page.content();
          const $ = cheerio.load(pageContent);
          
          // Remove noise elements
          this.config.removeSelectors.forEach(selector => {
            $(selector).remove();
          });
          
          // Extract the title
          const title = $('h1').first().text().trim() || 
                       $('title').text().trim() || 
                       'Untitled';
          
          // Find the main content
          let mainContent = $('main, article, .content, .documentation, .markdown-body, .doc-content').first();
          if (!mainContent.length) {
            // Fallback to body if no content container found
            mainContent = $('body');
          }
          
          // Create a filename from the URL
          let urlPath = url
            .replace(new RegExp(`^https?://${domain}`), '')
            .replace(/^\//g, '')
            .replace(/\/$/g, '')
            .replace(/\//g, '_');
            
          // Handle fragment identifiers in URLs
          if (urlPath.includes('#')) {
            urlPath = urlPath.replace(/#/g, '_section_');
          }
          
          // Final cleanup for valid filename
          urlPath = urlPath.replace(/[^\w\-._]/g, '_') || 'index';
          
          // Ensure filenames don't get too long
          if (urlPath.length > 100) {
            urlPath = urlPath.substring(0, 100);
          }
          
          const filePath = join(outputDir, `${urlPath}.html`);
          
          // Create HTML with metadata
          const fullContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="framework" content="${framework}">
  <meta name="version" content="${version}">
  <meta name="source-url" content="${url}">
  <meta name="fetched-at" content="${new Date().toISOString()}">
  <meta name="crawl-depth" content="${depth}">
</head>
<body>
  <h1>${title}</h1>
  ${mainContent.html() || ''}
</body>
</html>`;
          
          // Save the file
          await this.saveToFile(filePath, fullContent);
          savedFiles.push(filePath);
          logger.info(`Saved content from ${url} to ${filePath}`);
          
          // Double-check page limit before extracting more links
          if (savedFiles.length >= maxPages) {
            logger.info(`Reached maximum pages limit of ${maxPages}. Stopping.`);
            return;
          }
          
          // Extract links for further crawling if not at max depth
          if (depth < this.config.maxDepth && savedFiles.length < maxPages) {
            try {
              const links = await extractLinks(url, depth);
              
              // Add new links to the queue, respecting page limits
              let addedCount = 0;
              for (const link of links) {
                if (!crawledPages.has(link.url)) {
                  queue.push({ 
                    url: link.url, 
                    depth: depth + 1,
                    priority: link.priority 
                  });
                  addedCount++;
                  
                  // Limit queue size to avoid memory issues
                  if (queue.length > maxPages * 5) {
                    break;
                  }
                }
              }
              
              logger.debug(`Added ${addedCount} new links to the queue`);
              
              // Advanced queue sorting strategy 
              const isDocUrl = (url: string) => {
                return this.config.docUrlPatterns.some(pattern => url.includes(pattern)) ||
                      /\/(api|docs|reference|guide|tutorial)\//.test(url);
              };
              
              // Sort the queue using our hybrid approach
              queue.sort((a, b) => {
                // For pages with similar priority, process docs pages first
                const aIsDoc = isDocUrl(a.url);
                const bIsDoc = isDocUrl(b.url);
                
                if (aIsDoc !== bIsDoc) {
                  return aIsDoc ? -1 : 1; // Docs pages first
                }
                
                // For high-priority pages (important docs), sort primarily by priority
                if (a.priority > 150 || b.priority > 150) {
                  return b.priority - a.priority;
                }
                              
                // For medium-priority docs, consider both priority and depth
                if (aIsDoc && bIsDoc) {
                  // For docs with similar priority, favor depth to complete sections
                  if (Math.abs(a.priority - b.priority) < 30) {
                    // Same path parent - stay in the same section
                    const aPath = new URL(a.url).pathname;
                    const bPath = new URL(b.url).pathname;
                    
                    // If they share a common parent path, keep exploring the same section
                    const commonParentPath = aPath.split('/').slice(0, -1).join('/') === 
                                           bPath.split('/').slice(0, -1).join('/');
                    
                    if (commonParentPath) {
                      return a.depth - b.depth; // Prefer deeper pages in same section
                    }
                  }
                  
                  // Otherwise use priority
                  return b.priority - a.priority;
                }
                
                // For regular pages, prefer breadth-first to avoid going too deep in irrelevant areas
                return a.depth - b.depth || b.priority - a.priority;
              });
              
              // Keep queue at a reasonable size
              if (queue.length > maxPages * 5) {
                queue.length = maxPages * 5;
              }
              
              logger.debug(`Queue size after processing ${url}: ${queue.length}`);
            } catch (linkError) {
              logger.error(`Error extracting links from ${url}`, { error: linkError.message });
            }
          }
        } catch (error) {
          logger.error(`Failed to process ${url}`, { error: error.message, depth });
        }
      };
      
      // Main crawling loop with better termination handling
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;
      
      try {
        while (queue.length > 0 && savedFiles.length < maxPages) {
          // Hard stop if we've reached the page limit
          if (savedFiles.length >= maxPages) {
            logger.info(`Reached maximum pages limit of ${maxPages}. Stopping.`);
            break;
          }
          
          // Get the next URL to process
          const { url, depth } = queue.shift();
          
          try {
            await processPage(url, depth);
            consecutiveErrors = 0; // Reset error counter on success
          } catch (error) {
            consecutiveErrors++;
            logger.error(`Error in main loop processing ${url}`, { error: error.message });
            
            // Circuit breaker - stop if too many consecutive errors
            if (consecutiveErrors >= maxConsecutiveErrors) {
              logger.error(`${maxConsecutiveErrors} consecutive errors, stopping crawl`);
              break;
            }
          }
          
          // Add a small delay between requests to be nice to the server
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(`Fatal error in crawler`, { error: error.message });
      }
      
      logger.info(`Completed documentation scraping with ${savedFiles.length} files`);
      return savedFiles;
    } finally {
      await browser.close();
    }
  }
  
  /**
   * Save content to a file and handle directories
   */
  private async saveToFile(filePath: string, content: string): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dir = join(filePath, '..');
      await mkdir(dir, { recursive: true });
      
      // Write the file
      const { writeFile } = await import('node:fs/promises');
      await writeFile(filePath, content);
    } catch (error) {
      logger.error(`Failed to save content to ${filePath}`, { error: error.message });
      throw error;
    }
  }
}