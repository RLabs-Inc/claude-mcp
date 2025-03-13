import { Context, MiddlewareHandler, Next } from 'hono';
import { logger } from '../lib/logger';

/**
 * Simple API key authentication middleware
 * 
 * Requires a valid API key for protected routes
 */
export const apiKeyAuth = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    // Get the API key from environment variables
    const validApiKey = process.env.API_KEY;
    
    // Skip auth if no API key is configured
    if (!validApiKey) {
      logger.warn('API key authentication is disabled - no API_KEY set in environment');
      await next();
      return;
    }
    
    // Check for API key in headers
    const apiKey = c.req.header('X-API-Key');
    
    if (!apiKey) {
      logger.warn('Missing API key', { path: c.req.path });
      return c.json({ 
        success: false, 
        error: 'Authentication required',
        message: 'Missing API key. Please provide a valid API key in the X-API-Key header.' 
      }, 401);
    }
    
    if (apiKey !== validApiKey) {
      logger.warn('Invalid API key', { path: c.req.path });
      return c.json({ 
        success: false, 
        error: 'Authentication failed',
        message: 'Invalid API key provided.' 
      }, 401);
    }
    
    // Valid API key, continue
    await next();
  };
};