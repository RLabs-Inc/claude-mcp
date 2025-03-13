import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'node:path';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { searchIndex } from '../../src/lib/searchIndex';

describe('SearchIndex', () => {
  const testIndexPath = join(process.cwd(), 'test-search-index.json');
  
  // Mock the config for testing
  beforeEach(async () => {
    // Force re-initialization for each test
    // @ts-ignore - private property access for testing
    searchIndex.initialized = false;
    // @ts-ignore - private property access for testing
    searchIndex.indexPath = testIndexPath;
    // @ts-ignore - private property access for testing
    searchIndex.documents = [];
    
    // Create a clean index file for testing
    if (existsSync(testIndexPath)) {
      await unlink(testIndexPath);
    }
  });
  
  afterEach(async () => {
    // Clean up after tests
    if (existsSync(testIndexPath)) {
      await unlink(testIndexPath);
    }
  });
  
  it('should initialize with an empty index when no file exists', async () => {
    await searchIndex.initialize();
    // @ts-ignore - private property access for testing
    expect(searchIndex.documents).toEqual([]);
    expect(searchIndex.initialized).toBe(true);
  });
  
  it('should add a document to the index', async () => {
    const testDoc = {
      framework: 'react',
      version: '18.0.0',
      path: '/test/path',
      title: 'Test Document',
      content: 'This is a test document with some keywords like React components hooks and state.'
    };
    
    const id = await searchIndex.addDocument(testDoc);
    expect(id).toBeDefined();
    expect(id).toContain('react-18.0.0-');
    
    // Verify file was saved
    expect(existsSync(testIndexPath)).toBe(true);
    
    // Read the file and verify content
    const fileContent = await readFile(testIndexPath, 'utf-8');
    const savedData = JSON.parse(fileContent);
    expect(savedData).toBeArrayOfSize(1);
    expect(savedData[0].framework).toBe('react');
    expect(savedData[0].title).toBe('Test Document');
    expect(savedData[0].keywords).toBeArray();
    expect(savedData[0].keywords).toContain('react');
    expect(savedData[0].keywords).toContain('components');
  });
  
  it('should search documents and return matching results', async () => {
    // Add test documents
    await searchIndex.addDocument({
      framework: 'react',
      version: '18.0.0',
      path: '/test/path1',
      title: 'React Hooks Tutorial',
      content: 'Learn how to use React hooks effectively in your components. Hooks are a way to use state in functional components.'
    });
    
    await searchIndex.addDocument({
      framework: 'vue',
      version: '3.0.0',
      path: '/test/path2',
      title: 'Vue Components Guide',
      content: 'This guide explains Vue components and how they work. Components are reusable Vue instances.'
    });
    
    // Search for a term that should match both documents
    const results1 = await searchIndex.search('components');
    expect(results1).toBeArrayOfSize(2);
    
    // Search for a term that should match only React document
    const results2 = await searchIndex.search('hooks');
    expect(results2).toBeArrayOfSize(1);
    expect(results2[0].framework).toBe('react');
    
    // Search with framework filter
    const results3 = await searchIndex.search('components', { framework: 'vue' });
    expect(results3).toBeArrayOfSize(1);
    expect(results3[0].framework).toBe('vue');
    
    // Test snippet generation
    expect(results2[0].snippet).toContain('hooks');
  });
  
  it('should delete documents from the index', async () => {
    // Add test documents
    const id1 = await searchIndex.addDocument({
      framework: 'react',
      version: '18.0.0',
      path: '/test/path1',
      title: 'Test Document 1',
      content: 'Content 1'
    });
    
    const id2 = await searchIndex.addDocument({
      framework: 'react',
      version: '18.0.0',
      path: '/test/path2',
      title: 'Test Document 2',
      content: 'Content 2'
    });
    
    // Delete one document
    const deleted = await searchIndex.deleteDocument(id1);
    expect(deleted).toBe(true);
    
    // Verify only one document remains
    // @ts-ignore - private property access for testing
    expect(searchIndex.documents).toBeArrayOfSize(1);
    // @ts-ignore - private property access for testing
    expect(searchIndex.documents[0].id).toBe(id2);
  });
  
  it('should clear all documents for a specific framework and version', async () => {
    // Add test documents for multiple frameworks and versions
    await searchIndex.addDocument({
      framework: 'react',
      version: '18.0.0',
      path: '/test/path1',
      title: 'React 18 Doc',
      content: 'Content 1'
    });
    
    await searchIndex.addDocument({
      framework: 'react',
      version: '17.0.0',
      path: '/test/path2',
      title: 'React 17 Doc',
      content: 'Content 2'
    });
    
    await searchIndex.addDocument({
      framework: 'vue',
      version: '3.0.0',
      path: '/test/path3',
      title: 'Vue Doc',
      content: 'Content 3'
    });
    
    // Clear React 18 docs
    const clearedCount = await searchIndex.clearFrameworkVersion('react', '18.0.0');
    expect(clearedCount).toBe(1);
    
    // Verify correct documents remain
    // @ts-ignore - private property access for testing
    expect(searchIndex.documents).toBeArrayOfSize(2);
    
    // Make sure the right documents are left
    const results = await searchIndex.search('react', { version: '17.0.0' });
    expect(results).toBeArrayOfSize(1);
    expect(results[0].title).toBe('React 17 Doc');
  });
});