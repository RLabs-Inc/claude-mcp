import { z } from 'zod';
import { logger } from './logger';

/**
 * Environment configuration validation and defaults
 */

// Define schema for environment variables
const configSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Security
  API_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  
  // Documentation Storage
  DOCS_STORAGE_PATH: z.string().default('./docs'),
  
  // GitHub API
  GITHUB_TOKEN: z.string().optional(),
  
  // Puppeteer
  PUPPETEER_HEADLESS: z.string().transform(val => val === 'true').default('true'),
  PUPPETEER_TIMEOUT: z.string().transform(val => parseInt(val, 10)).default('60000'),
  
  // Scraper Configuration
  SCRAPER_REQUEST_DELAY: z.string().transform(val => parseInt(val, 10)).default('1000'),
  SCRAPER_MAX_CONCURRENT: z.string().transform(val => parseInt(val, 10)).default('1'),
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: z.string().transform(val => val === 'true').default('false'),
  RATE_LIMIT_MAX: z.string().transform(val => parseInt(val, 10)).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(val => parseInt(val, 10)).default('60000'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Parse and validate environment variables
function validateConfig() {
  try {
    return configSchema.parse(process.env);
  } catch (error) {
    logger.error('Invalid environment configuration', { error });
    
    // Log specific validation issues
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        logger.error(`Config validation error: ${err.message}`, { path: err.path.join('.') });
      });
    }
    
    // Return default configuration as fallback
    logger.warn('Using default configuration values');
    return configSchema.parse({});
  }
}

// Export validated configuration
export const config = validateConfig();