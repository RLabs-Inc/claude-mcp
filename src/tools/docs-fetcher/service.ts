import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { $ } from 'bun';

import { FRAMEWORK_REGISTRY } from './registry';
import { getScraperForFramework } from './scrapers/index';
import { processDocFiles, createDocIndex } from './processors';
import { logger } from '../../lib/logger';
import { config } from '../../lib/config';


/**
 * Fetches the latest version of a framework or library with enhanced error handling and rate limit awareness
 * @param framework The name of the framework to check
 * @returns The latest version string
 */
export async function getLatestVersion(framework: string): Promise<string> {
  const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
  
  if (!frameworkInfo) {
    logger.error(`Unknown framework requested: ${framework}`);
    throw new Error(`Unknown framework: ${framework}`);
  }
  
  // Function to handle retries with exponential backoff
  async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(1000 * Math.pow(2, attempt), 30000);
          
          logger.warn(`Rate limited by API, waiting ${waitTime}ms before retry`, {
            url,
            attempt,
            maxRetries,
            retryAfter
          });
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // For other successful responses, return immediately
        if (response.ok) {
          return response;
        }
        
        // For other error codes, throw with detailed info
        const errorBody = await response.text().catch(() => 'Could not read error body');
        lastError = new Error(`HTTP Error ${response.status}: ${response.statusText}\n${errorBody}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn(`API request attempt ${attempt}/${maxRetries} failed`, {
          url,
          error: lastError.message
        });
        
        if (attempt < maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }
    
    throw lastError || new Error('Maximum retries reached');
  }
  
  try {
    logger.debug(`Fetching latest version for ${framework}`, { type: frameworkInfo.type });
    
    // Check for custom version extractor
    if (frameworkInfo.customVersionExtractor && frameworkInfo.latestVersionUrl) {
      try {
        const response = await fetchWithRetry(frameworkInfo.latestVersionUrl);
        const data = await response.text();
        
        const version = frameworkInfo.customVersionExtractor(data);
        if (version) {
          logger.info(`Latest custom version for ${framework}: ${version}`);
          return version;
        }
        
        throw new Error('Failed to extract version from custom source');
      } catch (error) {
        logger.error(`Custom version extraction failed for ${framework}`, { error: error.message });
        throw error;
      }
    }
    
    if (frameworkInfo.type === 'npm' && frameworkInfo.packageName) {
      // Query npm registry for latest version
      try {
        const npmResponse = await fetchWithRetry(`https://registry.npmjs.org/${frameworkInfo.packageName}`);
        const data = await npmResponse.json();
        
        // Validate the response structure
        if (!data['dist-tags'] || !data['dist-tags'].latest) {
          throw new Error('Invalid npm registry response: missing dist-tags.latest');
        }
        
        const version = data['dist-tags'].latest;
        logger.info(`Latest npm version for ${framework} (${frameworkInfo.packageName}): ${version}`);
        return version;
      } catch (error) {
        logger.error(`NPM version check failed for ${framework}`, { 
          packageName: frameworkInfo.packageName,
          error: error.message 
        });
        throw error;
      }
    
    } else if (frameworkInfo.type === 'python' && frameworkInfo.pythonPackage) {
      // Query PyPI for latest version
      try {
        const pypiResponse = await fetchWithRetry(`https://pypi.org/pypi/${frameworkInfo.pythonPackage}/json`);
        const data = await pypiResponse.json();
        
        // Validate the response structure
        if (!data.info || !data.info.version) {
          throw new Error('Invalid PyPI response: missing info.version');
        }
        
        const version = data.info.version;
        logger.info(`Latest PyPI version for ${framework} (${frameworkInfo.pythonPackage}): ${version}`);
        return version;
      } catch (error) {
        logger.error(`PyPI version check failed for ${framework}`, { 
          pythonPackage: frameworkInfo.pythonPackage,
          error: error.message 
        });
        throw error;
      }
    
    } else if (frameworkInfo.type === 'github' && frameworkInfo.repo) {
      // Query GitHub API for latest release
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Claude-MCP-Tool/1.0'
        };
        
        // Add GitHub token if available
        if (config.GITHUB_TOKEN) {
          headers.Authorization = `token ${config.GITHUB_TOKEN}`;
        }
        
        // Try the latest release endpoint first
        try {
          const githubResponse = await fetchWithRetry(
            `https://api.github.com/repos/${frameworkInfo.repo}/releases/latest`, 
            { headers }
          );
          
          const data = await githubResponse.json();
          
          if (!data.tag_name) {
            throw new Error('Invalid GitHub response: missing tag_name');
          }
          
          const version = data.tag_name.replace(/^v/, '');
          logger.info(`Latest GitHub release version for ${framework} (${frameworkInfo.repo}): ${version}`);
          return version;
        } catch (releaseError) {
          // If latest release fails, try listing all releases
          logger.warn(`Failed to get latest GitHub release, trying to list all releases`, {
            repo: frameworkInfo.repo,
            error: releaseError.message
          });
          
          const releasesResponse = await fetchWithRetry(
            `https://api.github.com/repos/${frameworkInfo.repo}/releases?per_page=1`, 
            { headers }
          );
          
          const releases = await releasesResponse.json();
          
          if (!Array.isArray(releases) || releases.length === 0 || !releases[0].tag_name) {
            // If no releases, try tags as fallback
            logger.warn(`No GitHub releases found, trying tags`, {
              repo: frameworkInfo.repo
            });
            
            const tagsResponse = await fetchWithRetry(
              `https://api.github.com/repos/${frameworkInfo.repo}/tags?per_page=1`,
              { headers }
            );
            
            const tags = await tagsResponse.json();
            
            if (!Array.isArray(tags) || tags.length === 0 || !tags[0].name) {
              throw new Error('No GitHub releases or tags found');
            }
            
            const version = tags[0].name.replace(/^v/, '');
            logger.info(`Latest GitHub version from tags for ${framework}: ${version}`);
            return version;
          }
          
          const version = releases[0].tag_name.replace(/^v/, '');
          logger.info(`Latest GitHub version from releases list for ${framework}: ${version}`);
          return version;
        }
      } catch (error) {
        logger.error(`GitHub version check failed for ${framework}`, { 
          repo: frameworkInfo.repo,
          error: error.message 
        });
        
        // Fallback to 'latest' string for GitHub if everything fails
        return 'latest';
      }
    } else if (frameworkInfo.type === 'custom') {
      // For custom frameworks without version detection
      return 'latest';
    } else {
      throw new Error('Unsupported framework type or missing configuration');
    }
  } catch (error) {
    logger.error(`Error fetching latest version for ${framework}`, { error: error.message });
    
    // Return a default version string rather than failing completely
    return 'unknown';
  }
}

/**
 * Fetches documentation for a framework and saves it
 * @param framework The name of the framework
 * @param format The format to save the documentation in (json or markdown)
 * @returns Information about the fetched documentation
 */
export async function fetchDocumentation(
  framework: string, 
  format: 'json' | 'markdown' = 'json',
  maxPages: number = 50
): Promise<{ version: string, path: string, files: string[] }> {
  const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
  
  if (!frameworkInfo) {
    logger.error(`Unknown framework requested for documentation: ${framework}`);
    throw new Error(`Unknown framework: ${framework}`);
  }
  
  try {
    // 1. Get the latest version
    const version = await getLatestVersion(framework);
    
    // 2. Check if we already have this version
    const storageDir = config.DOCS_STORAGE_PATH || './docs';
    const basePath = join(storageDir, framework, version);
    
    if (existsSync(basePath)) {
      // Check if the metadata file exists to determine if this is a complete download
      const metadataPath = join(basePath, `metadata.${format === 'json' ? 'json' : 'md'}`);
      
      if (existsSync(metadataPath)) {
        logger.info(`Documentation for ${framework} ${version} already exists, reusing cached version`);
        
        // Get all files in the directory
        const cachedFiles: string[] = [];
        
        // Recursively get all files
        async function getFiles(dir: string) {
          const entries = await readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            
            if (entry.isDirectory()) {
              await getFiles(fullPath);
            } else {
              cachedFiles.push(fullPath);
            }
          }
        }
        
        await getFiles(basePath);
        
        return {
          version,
          path: basePath,
          files: cachedFiles
        };
      }
    }
    
    // Create directory if it doesn't exist
    await mkdir(basePath, { recursive: true });
    console.log(`Created directory: ${basePath}`);
    
    // 3. Fetch documentation using the appropriate scraper
    logger.info(`Fetching documentation for ${framework} ${version}`);
    
    // Get the appropriate scraper for this framework
    const scraper = getScraperForFramework(framework);
    logger.debug(`Using scraper for ${framework}`);
    
    // Run the scraper to fetch documentation with error handling
    let scrapedFiles: string[] = [];
    try {
      logger.debug(`Starting documentation scraping for ${framework} (max pages: ${maxPages})`);
      scrapedFiles = await scraper.fetchDocs(framework, version, basePath, maxPages);
      logger.info(`Successfully scraped ${scrapedFiles.length} files for ${framework}`);
    } catch (error) {
      logger.error(`Scraping failed for ${framework}`, { 
        error: error.message,
        framework,
        version 
      });
      throw new Error(`Documentation scraping failed: ${error.message}`);
    }
    
    // 4. Create a metadata file with information about the scrape
    const metadata = {
      framework,
      version,
      fetchedAt: new Date().toISOString(),
      docsUrl: frameworkInfo.docsUrl,
      apiDocsUrl: frameworkInfo.apiDocsUrl,
      fileCount: scrapedFiles.length,
      files: scrapedFiles.map(file => file.replace(basePath, '')),
      type: frameworkInfo.type
    };
    
    // Save the metadata in the requested format
    const metadataPath = join(basePath, `metadata.${format === 'json' ? 'json' : 'md'}`);
    
    if (format === 'json') {
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } else {
      // Convert to markdown format
      const markdown = `# ${framework} Documentation (v${version})

- **Fetched at**: ${metadata.fetchedAt}
- **Framework Type**: ${metadata.type}
- **Documentation URL**: ${frameworkInfo.docsUrl || 'N/A'}
- **API Documentation URL**: ${frameworkInfo.apiDocsUrl || 'N/A'}
- **File Count**: ${metadata.fileCount}

## Files

${metadata.files.map(file => `- ${file}`).join('\n')}
`;
      await writeFile(metadataPath, markdown);
    }
    
    logger.info(`Documentation for ${framework} ${version} saved successfully`);
    
    // Process the content and add to search index
    if (scrapedFiles.length > 0) {
      try {
        logger.info(`Processing ${scrapedFiles.length} documentation files for ${framework}`);
        console.log(`Processing ${scrapedFiles.length} documentation files for ${framework}`);
        
        // Create processed directory
        const processedDir = join(basePath, 'processed');
        
        // Process HTML files into the specified format and add to search index
        const processedFiles = await processDocFiles(
          scrapedFiles, 
          processedDir, 
          format,
          framework,
          version
        );
        
        logger.info(`Processed ${processedFiles.length} files for ${framework}`);
        console.log(`Processed ${processedFiles.length} files for ${framework}`);
        
        // Create an index of the processed files
        if (processedFiles.length > 0) {
          const indexPath = await createDocIndex(
            framework,
            version,
            processedFiles,
            processedDir,
            format
          );
          
          logger.info(`Created index at ${indexPath}`);
          
          return {
            version,
            path: basePath,
            files: scrapedFiles,
            processedFiles,
            indexPath
          };
        }
      } catch (error) {
        logger.error(`Error processing documentation files: ${error.message}`);
        console.error(`Error processing documentation files: ${error.message}`);
        // Continue and return the raw files even if processing fails
      }
    }
    
    return {
      version,
      path: basePath,
      files: scrapedFiles
    };
  } catch (error) {
    logger.error(`Error fetching documentation for ${framework}:`, { error: error.message });
    throw new Error(`Failed to fetch documentation for ${framework}: ${error.message}`);
  }
}