import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createToolTemplate } from '../../lib/tool-registry';

/**
 * Tool Template - Use this as a starting point for new tools
 * 
 * This is an example tool that demonstrates the basic structure.
 * Copy this directory and customize it for your needs.
 */

// Schema validation example
const exampleSchema = z.object({
  parameter: z.string().min(1),
  optionalParam: z.boolean().optional()
});

const toolTemplate = createToolTemplate({
  name: 'tool-template',
  description: 'Template for creating new tools',
  version: '0.1.0',
  setupRoutes: (router) => {
    // Example endpoint with validation
    router.post(
      '/example',
      zValidator('json', exampleSchema),
      async (c) => {
        const { parameter, optionalParam } = c.req.valid('json');
        
        try {
          // Your business logic here
          const result = {
            message: `You sent: ${parameter}`,
            optional: optionalParam ? 'Yes' : 'No'
          };
          
          return c.json({ 
            success: true,
            result
          });
        } catch (error) {
          console.error(`Error in example endpoint:`, error);
          return c.json({ 
            success: false, 
            error: error.message 
          }, 500);
        }
      }
    );
    
    // Get status endpoint - useful for health checks
    router.get('/status', async (c) => {
      return c.json({ 
        status: 'operational',
        timestamp: new Date().toISOString()
      });
    });
    
    return router;
  }
});

export default toolTemplate;