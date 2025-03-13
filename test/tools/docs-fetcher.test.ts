import { describe, expect, it, mock, spyOn } from 'bun:test';
import { getLatestVersion } from '../../src/tools/docs-fetcher/service';
import { FRAMEWORK_REGISTRY } from '../../src/tools/docs-fetcher/registry';

// Mock fetch for testing
global.fetch = mock(async (url: string) => {
  if (url.includes('registry.npmjs.org/react')) {
    return {
      json: async () => ({ 'dist-tags': { latest: '18.2.0' } })
    } as Response;
  } else if (url.includes('pypi.org/pypi/fastapi/json')) {
    return {
      json: async () => ({ info: { version: '0.103.1' } })
    } as Response;
  } else if (url.includes('api.github.com/repos')) {
    return {
      json: async () => ({ tag_name: 'v2.5.0' })
    } as Response;
  }
  
  throw new Error(`Unhandled URL in fetch mock: ${url}`);
});

describe('Docs Fetcher', () => {
  describe('Registry', () => {
    it('should have the required frameworks', () => {
      expect(FRAMEWORK_REGISTRY).toBeDefined();
      expect(FRAMEWORK_REGISTRY.react).toBeDefined();
      expect(FRAMEWORK_REGISTRY.langchain).toBeDefined();
      expect(FRAMEWORK_REGISTRY.fastapi).toBeDefined();
    });
    
    it('each framework should have required properties', () => {
      for (const [name, info] of Object.entries(FRAMEWORK_REGISTRY)) {
        expect(info.type).toBeDefined();
        
        if (info.type === 'npm') {
          expect(info.packageName).toBeDefined();
        } else if (info.type === 'python') {
          expect(info.pythonPackage).toBeDefined();
        } else if (info.type === 'github') {
          expect(info.repo).toBeDefined();
        }
        
        // At least one documentation source should be defined
        expect(info.docsUrl || info.apiDocsUrl || info.githubDocsDir).toBeDefined();
      }
    });
  });
  
  describe('getLatestVersion', () => {
    it('should get latest version for npm packages', async () => {
      const version = await getLatestVersion('react');
      expect(version).toBe('18.2.0');
    });
    
    it('should get latest version for python packages', async () => {
      const version = await getLatestVersion('fastapi');
      expect(version).toBe('0.103.1');
    });
    
    it('should get latest version for github repos', async () => {
      // Mock a framework with github type for testing
      const testFramework = 'test-github-framework';
      FRAMEWORK_REGISTRY[testFramework] = {
        type: 'github',
        repo: 'test/repo',
        docsUrl: 'https://example.com'
      };
      
      const version = await getLatestVersion(testFramework);
      expect(version).toBe('2.5.0'); // without the 'v'
      
      // Clean up
      delete FRAMEWORK_REGISTRY[testFramework];
    });
    
    it('should throw error for unknown frameworks', async () => {
      await expect(getLatestVersion('unknown-framework')).rejects.toThrow('Unknown framework');
    });
  });
});