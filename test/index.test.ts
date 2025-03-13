import { describe, expect, it, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { loadTools } from '../src/lib/tool-registry';
import { config } from '../src/lib/config';

describe('MCP Server', () => {
  // Make sure tests run in test environment
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });
  
  it('should load tools from registry', () => {
    const tools = loadTools();
    expect(tools).toBeDefined();
    expect(Object.keys(tools).length).toBeGreaterThan(0);
    expect(tools['docs-fetcher']).toBeDefined();
  });

  it('each tool should implement the Tool interface', () => {
    const tools = loadTools();
    
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.name).toBe(name);
      expect(tool.description).toBeDefined();
      expect(tool.version).toBeDefined();
      expect(tool.routes).toBeInstanceOf(Hono);
    }
  });
  
  it('should correctly validate config with defaults', () => {
    // Test that config has the correct default values
    expect(config.PORT).toBeDefined();
    expect(config.HOST).toBeDefined();
    expect(config.NODE_ENV).toBe('test'); // Should detect the test environment
    expect(config.DOCS_STORAGE_PATH).toBeDefined();
  });
});