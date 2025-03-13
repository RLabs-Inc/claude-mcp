import { logger } from '../../../lib/logger';
import { FRAMEWORK_REGISTRY } from '../registry';
import { DocsScraper } from './base';
import { LangChainScraper } from './langchain';
import { FastAPIScraper } from './fastapi';
import { GenericScraper } from './generic';

/**
 * Get the appropriate scraper for a framework
 */
export function getScraperForFramework(framework: string): DocsScraper {
  const frameworkLower = framework.toLowerCase();
  
  if (frameworkLower === 'langchain' || frameworkLower === 'langchain-js') {
    logger.debug(`Using LangChain scraper for ${framework}`);
    return new LangChainScraper();
  } 
  
  if (frameworkLower === 'fastapi') {
    logger.debug(`Using FastAPI scraper for ${framework}`);
    return new FastAPIScraper();
  }
  
  // For other frameworks, use the generic scraper
  logger.debug(`Using generic scraper for ${framework}`);
  return new GenericScraper();
}

// Export all scrapers
export { DocsScraper } from './base';
export { LangChainScraper } from './langchain';
export { FastAPIScraper } from './fastapi';
export { GenericScraper } from './generic';