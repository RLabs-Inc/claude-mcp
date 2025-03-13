import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { searchIndex } from '../../lib/searchIndex';
import { logger } from '../../lib/logger';

/**
 * Search endpoints for the docs-fetcher tool
 */
const searchRouter = new Hono();

// Schema for search endpoint
const searchSchema = z.object({
  query: z.string().min(1).max(100),
  framework: z.string().optional(),
  version: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10)
});

// Search documentation content
searchRouter.post(
  '/',
  zValidator('json', searchSchema),
  async (c) => {
    const { query, framework, version, limit } = c.req.valid('json');
    
    try {
      const results = await searchIndex.search(query, {
        framework,
        version,
        limit
      });
      
      logger.info('Documentation search performed', { 
        query, 
        framework, 
        version,
        resultCount: results.length 
      });
      
      return c.json({
        success: true,
        query,
        filters: {
          framework,
          version
        },
        resultCount: results.length,
        results
      });
    } catch (error) {
      logger.error('Search error', { error: error.message, query });
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
    // We'll need to implement the method to get stats
    // For now, return a placeholder
    return c.json({
      success: true,
      stats: {
        indexedDocuments: 0,
        frameworkCount: 0,
        message: 'Not implemented yet'
      }
    });
  } catch (error) {
    logger.error('Failed to get search stats', { error: error.message });
    return c.json({
      success: false,
      error: 'Failed to get search stats',
      message: error.message
    }, 500);
  }
});

export default searchRouter;