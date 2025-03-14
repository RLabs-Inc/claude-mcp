import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { searchIndex } from '../../lib/searchIndex';
import { vectorStore } from '../../lib/vectorStore'; 
import { logger } from '../../lib/logger';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

/**
 * Search endpoints for the docs-fetcher tool
 */
const searchRouter = new Hono();

// Schema for search endpoint
const searchSchema = z.object({
  query: z.string().min(1).max(300),
  framework: z.string().optional(),
  version: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
  hybridAlpha: z.number().min(0).max(1).default(0.5)
});

// Search documentation content
searchRouter.post(
  '/',
  zValidator('json', searchSchema),
  async (c) => {
    const { query, framework, version, limit, mode, hybridAlpha } = c.req.valid('json');
    
    // Extract user agent and information about the requester
    const userAgent = c.req.header('user-agent') || 'unknown';
    const isClaudeCode = userAgent.includes('claude-code') || userAgent.includes('Claude-Code') || c.req.header('x-claude-code-client') === 'true';
    const clientId = c.req.header('x-client-id') || 'unknown';
    
    // Log access with detailed information
    logger.info('Documentation search access', {
      isClaudeCode,
      userAgent,
      clientId,
      query,
      framework,
      version,
      mode,
      timestamp: new Date().toISOString()
    });
    
    // Record this access in a dedicated log file for Claude Code usage tracking
    if (isClaudeCode) {
      try {
        const { appendFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const logDir = join(process.cwd(), 'logs');
        const logPath = join(logDir, 'claude-code-access.log');
        
        // Create the log directory if it doesn't exist
        if (!existsSync(logDir)) {
          await mkdir(logDir, { recursive: true });
        }
        
        await appendFile(
          logPath, 
          JSON.stringify({
            timestamp: new Date().toISOString(),
            query,
            framework,
            version,
            mode,
            clientId
          }) + '\n', 
          { flag: 'a' }
        );
        
        logger.info('Recorded Claude Code access', { logPath });
      } catch (logError) {
        logger.error('Failed to record Claude Code access log', { error: logError.message });
      }
    }
    
    try {
      let results;
      
      try {
        // Check if vector store is properly initialized for semantic/hybrid search
        const hasVectorSearch = vectorStore.isInitialized();
        const vectorStats = hasVectorSearch ? await vectorStore.getStats() : null;
        const vectorCount = vectorStats ? vectorStats.totalDocuments : 0;
        
        // Use the appropriate search method
        if (mode === 'keyword' || !hasVectorSearch || vectorCount === 0) {
          if (mode !== 'keyword') {
            logger.warn(`Falling back to keyword search because vector search is ${!hasVectorSearch ? 'not initialized' : 'empty'}`);
          }
          
          // Fallback to keyword search
          results = await searchIndex.search(query, {
            framework,
            version,
            limit
          });
          
          logger.info('Keyword search performed', { 
            query, 
            framework, 
            version,
            resultCount: results.length 
          });
        } else {
          // Use vector search
          results = await vectorStore.search(query, {
            framework,
            version,
            limit,
            hybridAlpha: mode === 'semantic' ? 1.0 : hybridAlpha
          });
          
          // If vector search fails or returns no results, fall back to keyword search
          if (!results || results.length === 0) {
            logger.warn(`Vector search returned no results, falling back to keyword search`);
            
            results = await searchIndex.search(query, {
              framework,
              version,
              limit
            });
          }
          
          logger.info(`${mode.charAt(0).toUpperCase() + mode.slice(1)} search performed`, { 
            query, 
            framework, 
            version,
            mode,
            hybridAlpha: mode === 'hybrid' ? hybridAlpha : undefined,
            resultCount: results.length 
          });
        }
      } catch (searchError) {
        logger.error('Search method failed, falling back to keyword search', { 
          error: searchError.message,
          mode
        });
        
        // Last resort fallback
        results = await searchIndex.search(query, {
          framework,
          version,
          limit
        });
      }
      
      return c.json({
        success: true,
        query,
        mode,
        filters: {
          framework,
          version
        },
        resultCount: results.length,
        results
      });
    } catch (error) {
      logger.error('Search error', { error: error.message, query, mode });
      return c.json({
        success: false,
        error: 'Search failed',
        message: error.message
      }, 500);
    }
  }
);

// Get search stats
searchRouter.get('/stats', async (c) => {
  try {
    // Get stats from vector store if available
    if (vectorStore.isInitialized()) {
      const stats = await vectorStore.getStats();
      
      return c.json({
        success: true,
        stats: {
          indexedDocuments: stats.totalDocuments,
          frameworkCount: stats.frameworks.length,
          frameworks: stats.frameworks,
          versions: stats.versions,
          lastUpdated: new Date(stats.lastUpdated).toISOString()
        }
      });
    } else {
      // Try to get stats from keyword index as fallback
      const keywordStats = await searchIndex.getStats();
      
      return c.json({
        success: true,
        stats: {
          indexedDocuments: keywordStats.documentCount || 0,
          frameworkCount: keywordStats.frameworkCount || 0,
          frameworks: keywordStats.frameworks || [],
          message: 'Using keyword search stats (vector search not initialized)'
        }
      });
    }
  } catch (error) {
    logger.error('Failed to get search stats', { error: error.message });
    return c.json({
      success: false,
      error: 'Failed to get search stats',
      message: error.message
    }, 500);
  }
});

// Rebuild the search index
searchRouter.post('/rebuild', async (c) => {
  try {
    logger.info('Starting search index rebuild');
    
    if (vectorStore.isInitialized()) {
      await vectorStore.rebuildIndex();
      
      // Get updated stats after rebuild
      const stats = await vectorStore.getStats();
      
      return c.json({
        success: true,
        message: 'Vector search index rebuilt successfully',
        stats: {
          indexedDocuments: stats.totalDocuments,
          frameworkCount: stats.frameworks.length,
          frameworks: stats.frameworks,
          versions: stats.versions,
          lastUpdated: new Date(stats.lastUpdated).toISOString()
        }
      });
    } else {
      return c.json({
        success: false,
        error: 'Vector store not initialized'
      }, 400);
    }
  } catch (error) {
    logger.error('Failed to rebuild search index', { error: error.message });
    return c.json({
      success: false,
      error: 'Failed to rebuild search index',
      message: error.message
    }, 500);
  }
});

export default searchRouter;