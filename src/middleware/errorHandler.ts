import { Context, MiddlewareHandler, Next } from 'hono';
import { logger } from '../lib/logger';

/**
 * Error handler middleware for catching and processing exceptions in a unified way
 */
export const errorHandler = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      logger.error('Unhandled error occurred', {
        error: error.message, 
        stack: error.stack,
        path: c.req.path,
        method: c.req.method
      });

      const status = error.status || 500;
      const message = status === 500 
        ? 'Internal Server Error' 
        : error.message || 'Something went wrong';
      
      // In production, avoid returning sensitive error details for 500 errors
      const isProd = process.env.NODE_ENV === 'production';
      const response = {
        success: false,
        error: message,
        ...(status !== 500 || !isProd) && { 
          details: error.cause || error.details || null
        }
      };

      return c.json(response, status);
    }
  };
};