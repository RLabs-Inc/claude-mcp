import { logger } from '../../../lib/logger';
import { DocsScraper, BaseScraper } from './base';
import { GenericScraper } from './generic';

/**
 * Get the appropriate scraper for a framework
 * 
 * This always returns the generic scraper, which is designed to work with any documentation site
 */
export function getScraperForFramework(framework: string): DocsScraper {
  logger.debug(`Using generic documentation scraper for ${framework}`);
  return new GenericScraper();
}

// Export the scraper interface and implementations
export type { DocsScraper };
export { BaseScraper, GenericScraper };