import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { $ } from 'bun';

import { FRAMEWORK_REGISTRY } from './registry';
import { getScraperForFramework } from './scrapers';
import { logger } from '../../lib/logger';
import { config } from '../../lib/config';


/**
 * Fetches the latest version of a framework or library
 * @param framework The name of the framework to check
 * @returns The latest version string
 */
export async function getLatestVersion(framework: string): Promise<string> {
  const frameworkInfo = FRAMEWORK_REGISTRY[framework.toLowerCase()];
  
  if (!frameworkInfo) {
    logger.error(`Unknown framework requested: ${framework}`);
    throw new Error(`Unknown framework: ${framework}`);
  }
  
  try {
    logger.debug(`Fetching latest version for ${framework}`, { type: frameworkInfo.type });
    
    if (frameworkInfo.type === 'npm' && frameworkInfo.packageName) {
      // Query npm registry for latest version
      const npmResponse = await fetch(`https://registry.npmjs.org/${frameworkInfo.packageName}`);
      
      if (!npmResponse.ok) {
        throw new Error(`Failed to query npm registry: ${npmResponse.statusText}`);
      }
      
      const data = await npmResponse.json();
      const version = data['dist-tags']?.latest || 'unknown';
      
      logger.info(`Latest npm version for ${framework} (${frameworkInfo.packageName}): ${version}`);
      return version;
    
    } else if (frameworkInfo.type === 'python' && frameworkInfo.pythonPackage) {
      // Query PyPI for latest version
      const pypiResponse = await fetch(`https://pypi.org/pypi/${frameworkInfo.pythonPackage}/json`);
      
      if (!pypiResponse.ok) {
        throw new Error(`Failed to query PyPI: ${pypiResponse.statusText}`);
      }
      
      const data = await pypiResponse.json();
      const version = data.info?.version || 'unknown';
      
      logger.info(`Latest PyPI version for ${framework} (${frameworkInfo.pythonPackage}): ${version}`);
      return version;
    
    } else if (frameworkInfo.type === 'github' && frameworkInfo.repo) {
      // Query GitHub API for latest release
      const headers: Record<string, string> = {};
      
      // Add GitHub token if available
      if (config.GITHUB_TOKEN) {
        headers.Authorization = `token ${config.GITHUB_TOKEN}`;
      }
      
      const githubResponse = await fetch(`https://api.github.com/repos/${frameworkInfo.repo}/releases/latest`, { 
        headers 
      });
      
      if (!githubResponse.ok) {
        throw new Error(`Failed to query GitHub API: ${githubResponse.statusText}`);
      }
      
      const data = await githubResponse.json();
      const version = data.tag_name ? data.tag_name.replace(/^v/, '') : 'unknown';
      
      logger.info(`Latest GitHub version for ${framework} (${frameworkInfo.repo}): ${version}`);
      return version;
    
    } else {
      throw new Error('Unsupported framework type or missing configuration');
    }
  } catch (error) {
    logger.error(`Error fetching latest version for ${framework}`, { error: error.message });
    throw new Error(`Failed to fetch latest version for ${framework}: ${error.message}`);
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
  format: 'json' | 'markdown' = 'json'
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
    
    // 3. Fetch documentation using the appropriate scraper
    logger.info(`Fetching documentation for ${framework} ${version}`);
    
    // Get the appropriate scraper for this framework
    const scraper = getScraperForFramework(framework);
    logger.debug(`Using scraper for ${framework}`);
    
    // Run the scraper to fetch documentation with error handling
    let scrapedFiles: string[] = [];
    try {
      logger.debug(`Starting documentation scraping for ${framework}`);
      scrapedFiles = await scraper.fetchDocs(framework, version, basePath);
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