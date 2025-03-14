import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

import { loadTools } from './lib/tool-registry';
import { getClaudeCodeIntegrationStatus, installClaudeCodePlugin } from './integrations/claude-code';
import { logger } from './lib/logger';
import { config } from './lib/config';
import { errorHandler } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { vectorStore } from './lib/vectorStore';

// Validate required environment variables
if (config.NODE_ENV === 'production' && !config.API_KEY) {
  logger.warn('Running in production without API_KEY set - authentication is disabled');
}

// Create the Hono app
const app = new Hono();
const PORT = config.PORT;
const HOST = config.HOST;

// Global middleware (order matters)
app.use('*', errorHandler());  // Catch and handle errors
app.use('*', honoLogger());    // HTTP request logging
app.use('*', prettyJSON());    // Pretty JSON responses in development
app.use('*', secureHeaders()); // Security headers
app.use('*', cors({            // CORS configuration
  origin: config.CORS_ORIGIN,
  maxAge: 86400,
}));
// Rate limiting only in production mode
if (config.NODE_ENV === 'production' && config.RATE_LIMIT_ENABLED === 'true') {
  logger.info('Rate limiting enabled');
  app.use('*', rateLimit());
}

// Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    env: config.NODE_ENV
  });
});

// Authentication is optional and only applied if API_KEY is set
// For personal or local use, this can be omitted
if (config.API_KEY && config.NODE_ENV === 'production') {
  logger.info('API Authentication enabled');
  app.use('*', apiKeyAuth());
} else {
  logger.info('API Authentication disabled - running in open mode');
}

// Initialize vector store in the background
vectorStore.initialize().catch(error => {
  logger.error('Failed to initialize vector store', { error: error.message });
});

// Load all tools dynamically
const tools = loadTools();

// Base routes
app.get('/', (c) => {
  return c.json({
    status: 'MCP Server Running',
    version: process.env.npm_package_version || '0.1.0',
    availableTools: Object.keys(tools)
  });
});

// Claude Code integration routes
app.get('/claude-code/status', async (c) => {
  try {
    const status = await getClaudeCodeIntegrationStatus();
    return c.json(status);
  } catch (error) {
    logger.error('Failed to get Claude Code integration status', { error: error.message });
    throw error;
  }
});

app.post('/claude-code/install', async (c) => {
  try {
    const serverUrl = `http://${HOST}:${PORT}`;
    await installClaudeCodePlugin(serverUrl);
    logger.info('Claude Code plugin installed successfully');
    return c.json({ success: true, message: 'Claude Code plugin installed successfully' });
  } catch (error) {
    logger.error('Failed to install Claude Code plugin', { error: error.message });
    throw error;
  }
});

// Register tool routes
Object.entries(tools).forEach(([name, tool]) => {
  app.route(`/api/tools/${name}`, tool.routes);
  logger.info(`Registered tool: ${name}`);
});

// Start server
serve({
  fetch: app.fetch,
  port: Number(PORT)
});

logger.info(`MCP Server running at http://${HOST}:${PORT}`);
logger.info('Available endpoints:');
logger.info(`- API Tools: http://${HOST}:${PORT}/api/tools/...`);
logger.info(`- Claude Code Integration: http://${HOST}:${PORT}/claude-code/...`);