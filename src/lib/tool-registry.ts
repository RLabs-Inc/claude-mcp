import { Hono } from 'hono';
import type { Tool } from '../types/tool';

// Import all tools here
import docsFetcher from '../tools/docs-fetcher';

const tools: Record<string, Tool> = {
  'docs-fetcher': docsFetcher,
  // Add new tools here as they're developed
};

/**
 * Load all registered tools
 */
export function loadTools(): Record<string, Tool> {
  return tools;
}

/**
 * Register a new tool
 * @param name Tool identifier
 * @param tool Tool implementation
 */
export function registerTool(name: string, tool: Tool): void {
  tools[name] = tool;
}

/**
 * Get a specific tool by name
 * @param name Tool identifier
 * @returns Tool implementation or undefined if not found
 */
export function getTool(name: string): Tool | undefined {
  return tools[name];
}

/**
 * Tool template for creating new tools
 * 
 * Use this to create a new tool:
 * 
 * ```typescript
 * import { createToolTemplate } from '../lib/tool-registry';
 * 
 * const myTool = createToolTemplate({
 *   name: 'my-tool',
 *   description: 'What my tool does',
 *   version: '0.1.0',
 *   setupRoutes: (router) => {
 *     router.get('/', (c) => c.json({ status: 'ready' }));
 *     router.get('/hello', (c) => c.json({ message: 'Hello World!' }));
 *     // Add more routes...
 *     return router;
 *   }
 * });
 * 
 * export default myTool;
 * ```
 */
export function createToolTemplate({
  name,
  description,
  version,
  setupRoutes
}: {
  name: string;
  description: string;
  version: string;
  setupRoutes: (router: Hono) => Hono;
}): Tool {
  const router = new Hono();
  
  // Add info endpoint for all tools
  router.get('/', (c) => {
    return c.json({
      name,
      description,
      version
    });
  });
  
  // Let the tool setup its custom routes
  const configuredRouter = setupRoutes(router);
  
  return {
    name,
    description,
    version,
    routes: configuredRouter
  };
}