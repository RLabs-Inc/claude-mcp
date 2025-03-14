import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import type { Tool } from '../../types/tool';
import { getLatestVersion, fetchDocumentation } from './service';
import { processDocFiles, createDocIndex } from './processors';
import { FRAMEWORK_REGISTRY, saveRegistry } from './registry';
import { logger } from '../../lib/logger';
import { config } from '../../lib/config';
import searchRouter from './search';

// Schema validation for endpoints
const fetchDocsSchema = z.object({
  framework: z.string().min(1),
  storageFormat: z.enum(['json', 'markdown']).default('json'),
  processContent: z.boolean().default(true),
  maxPages: z.number().int().min(1).max(200).default(50).optional()
});

const versionCheckSchema = z.object({
  framework: z.string().min(1)
});

const addFrameworkSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['npm', 'python', 'github', 'custom']),
  packageName: z.string().optional(),
  pythonPackage: z.string().optional(),
  repo: z.string().optional(),
  docsUrl: z.string().url(),
  apiDocsUrl: z.string().url().optional(),
});

// Create router for this tool
const router = new Hono();

// List available frameworks
router.get(
  '/frameworks',
  async (c) => {
    const type = c.req.query('type') || 'all';
    
    const frameworks = Object.entries(FRAMEWORK_REGISTRY)
      .filter(([_, info]) => type === 'all' || info.type === type)
      .map(([name, info]) => ({
        name,
        type: info.type,
        docsUrl: info.docsUrl,
        apiDocsUrl: info.apiDocsUrl
      }));
    
    return c.json({ frameworks });
  }
);

// Add a new framework
router.post(
  '/framework',
  zValidator('json', addFrameworkSchema),
  async (c) => {
    const frameworkInfo = c.req.valid('json');
    const { name } = frameworkInfo;
    
    // Check if framework already exists
    if (FRAMEWORK_REGISTRY[name.toLowerCase()]) {
      return c.json({ 
        success: false, 
        error: `Framework ${name} already exists` 
      }, 400);
    }
    
    try {
      // Add to registry and persist to disk
      FRAMEWORK_REGISTRY[name.toLowerCase()] = frameworkInfo;
      saveRegistry(FRAMEWORK_REGISTRY);
      
      logger.info(`Added new framework to registry and saved to disk: ${name}`, { type: frameworkInfo.type });
      
      return c.json({ 
        success: true, 
        message: `Framework ${name} added successfully`,
        framework: frameworkInfo
      });
    } catch (error) {
      logger.error(`Failed to add framework ${name}`, { error: error.message });
      return c.json({ 
        success: false, 
        error: `Failed to add framework: ${error.message}` 
      }, 500);
    }
  }
);

// Endpoint to get the latest version of a framework/library
router.post(
  '/latest-version',
  zValidator('json', versionCheckSchema),
  async (c) => {
    const { framework } = c.req.valid('json');
    
    try {
      const version = await getLatestVersion(framework);
      return c.json({ framework, latestVersion: version });
    } catch (error) {
      logger.error(`Failed to get latest version for ${framework}`, { error: error.message });
      return c.json({ error: `Failed to get latest version: ${error.message}` }, 500);
    }
  }
);

// Endpoint to fetch and process documentation
router.post(
  '/fetch',
  zValidator('json', fetchDocsSchema),
  async (c) => {
    const { framework, storageFormat, processContent, maxPages } = c.req.valid('json');
    
    try {
      logger.info(`Fetching documentation for ${framework} in ${storageFormat} format`);
      
      // Fetch raw documentation
      const result = await fetchDocumentation(framework, storageFormat, maxPages);
      
      // Process the content if requested
      if (processContent && result.files.length > 0) {
        logger.info(`Processing ${result.files.length} documentation files for ${framework}`);
        
        // Create processed directory
        const processedDir = join(result.path, 'processed');
        
        // Process HTML files into the specified format and add to search index
        const processedFiles = await processDocFiles(
          result.files, 
          processedDir, 
          storageFormat,
          framework,
          result.version
        );
        
        // Create an index of the processed files
        if (processedFiles.length > 0) {
          const indexPath = await createDocIndex(
            framework,
            result.version,
            processedFiles,
            processedDir,
            storageFormat
          );
          
          return c.json({ 
            success: true, 
            framework, 
            version: result.version,
            rawDocsLocation: result.path,
            processedDocsLocation: processedDir,
            indexFile: indexPath,
            fileCount: {
              raw: result.files.length,
              processed: processedFiles.length
            }
          });
        }
      }
      
      return c.json({ 
        success: true, 
        framework, 
        version: result.version,
        docsLocation: result.path,
        fileCount: result.files.length
      });
    } catch (error) {
      logger.error(`Error in /fetch endpoint:`, { error: error.message });
      return c.json({ error: `Failed to fetch documentation: ${error.message}` }, 500);
    }
  }
);

// Get documentation status and available versions
router.get('/status/:framework', async (c) => {
  const framework = c.req.param('framework');
  
  try {
    // Check if we have documentation for this framework
    const docsDir = join(config.DOCS_STORAGE_PATH || './docs', framework);
    
    try {
      // Read the directory to see what versions we have
      const versions = await readdir(docsDir);
      
      // Get the latest version from the registry
      const latestVersion = await getLatestVersion(framework);
      
      const versionDetails = await Promise.all(
        versions.map(async (version) => {
          try {
            // Try to read the metadata for each version
            const metadataPath = join(docsDir, version, 'metadata.json');
            const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
            
            return {
              version,
              fetchedAt: metadata.fetchedAt,
              fileCount: metadata.fileCount,
              processed: metadata.processed || false
            };
          } catch (err) {
            // If no metadata, just return basic info
            return {
              version,
              available: true
            };
          }
        })
      );
      
      return c.json({ 
        framework,
        available: versions.length > 0,
        latestVersion,
        versions: versionDetails,
        upToDate: versions.includes(latestVersion)
      });
    } catch (err) {
      // No docs directory means we don't have docs for this framework yet
      return c.json({ 
        framework,
        available: false,
        message: 'No documentation available for this framework'
      });
    }
  } catch (error) {
    logger.error(`Failed to check documentation status for ${framework}`, { error: error.message });
    return c.json({ error: `Failed to check documentation status: ${error.message}` }, 500);
  }
});

// Delete a framework from the registry
router.delete(
  '/framework/:name',
  async (c) => {
    const name = c.req.param('name').toLowerCase();
    
    // Check if framework exists
    if (!FRAMEWORK_REGISTRY[name]) {
      return c.json({ 
        success: false, 
        error: `Framework ${name} not found` 
      }, 404);
    }
    
    try {
      // Remove from registry and persist changes
      delete FRAMEWORK_REGISTRY[name];
      saveRegistry(FRAMEWORK_REGISTRY);
      
      logger.info(`Deleted framework from registry: ${name}`);
      
      return c.json({ 
        success: true, 
        message: `Framework ${name} deleted successfully` 
      });
    } catch (error) {
      logger.error(`Failed to delete framework ${name}`, { error: error.message });
      return c.json({ 
        success: false, 
        error: `Failed to delete framework: ${error.message}` 
      }, 500);
    }
  }
);

// Mount search endpoints
router.route('/search', searchRouter);

// Export as a Tool
const docsFetcherTool: Tool = {
  name: 'docs-fetcher',
  description: 'Fetches and indexes latest documentation for frameworks and libraries',
  version: '0.1.0',
  routes: router
};

export default docsFetcherTool;