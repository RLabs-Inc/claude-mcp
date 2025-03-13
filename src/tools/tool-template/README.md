# Tool Template

This is a template for creating new tools for the MCP server. Use this as a starting point for implementing your own tools.

## Usage

1. Copy this directory to create a new tool:
   ```bash
   cp -r src/tools/tool-template src/tools/your-new-tool
   ```

2. Modify the files to implement your tool:
   - Update `index.ts` with your tool's functionality
   - Create additional files as needed for your tool's services

3. Register your tool in `src/lib/tool-registry.ts`:
   ```typescript
   import yourNewTool from '../tools/your-new-tool';
   
   const tools: Record<string, Tool> = {
     'docs-fetcher': docsFetcher,
     'your-new-tool': yourNewTool,
     // ...
   };
   ```

## Tool Structure

A typical tool should:

1. Use the `createToolTemplate` function to define basic metadata
2. Configure routes for API endpoints
3. Implement the business logic for each endpoint

## Example

```typescript
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createToolTemplate } from '../../lib/tool-registry';

// Schema validation
const mySchema = z.object({
  input: z.string().min(1)
});

const myTool = createToolTemplate({
  name: 'my-tool',
  description: 'My awesome tool',
  version: '0.1.0',
  setupRoutes: (router) => {
    // Add endpoints
    router.post(
      '/process',
      zValidator('json', mySchema),
      async (c) => {
        const { input } = c.req.valid('json');
        
        // Your logic here
        const result = `Processed: ${input}`;
        
        return c.json({ success: true, result });
      }
    );
    
    return router;
  }
});

export default myTool;
```

## Integration with Claude Code

Once your tool is registered, it will automatically be available through the Claude Code CLI plugin:

```bash
# Get info about your tool
claude tools info your-new-tool

# Use your tool
claude tool:your-new-tool process
```