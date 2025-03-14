import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { logger } from '../../lib/logger';

/**
 * Framework registry type definition
 */
export type FrameworkRegistry = Record<string, {
  type: 'npm' | 'github' | 'python' | 'custom',
  repo?: string,
  packageName?: string,
  pythonPackage?: string,
  docsUrl?: string,
  apiDocsUrl?: string,
  githubDocsDir?: string,
  latestVersionUrl?: string,
  docsSections?: string[],
  customVersionExtractor?: (data: string) => string
}>;

/**
 * Default frameworks to include in the registry
 */
const DEFAULT_FRAMEWORKS: FrameworkRegistry = {
  'react': {
    type: 'npm',
    packageName: 'react',
    docsUrl: 'https://react.dev/reference',
  },
  'vue': {
    type: 'npm',
    packageName: 'vue',
    docsUrl: 'https://vuejs.org/guide',
  },
  'angular': {
    type: 'npm',
    packageName: '@angular/core',
    docsUrl: 'https://angular.io/docs',
  },
  'svelte': {
    type: 'npm',
    packageName: 'svelte',
    docsUrl: 'https://svelte.dev/docs',
  },
  'express': {
    type: 'npm',
    packageName: 'express',
    docsUrl: 'https://expressjs.com/en/4x/api.html',
  },
  'next': {
    type: 'npm',
    packageName: 'next',
    docsUrl: 'https://nextjs.org/docs',
  },
  'superforms': {
    type: 'npm',
    packageName: 'superforms',
    docsUrl: 'https://superforms.rocks',
  },
  'hono': {
    type: 'npm',
    packageName: 'hono',
    docsUrl: 'https://hono.dev/docs/top',
    docsSections: [
      'top',
      'concepts',
      'api',
      'helpers',
      'middleware',
      'guides'
    ]
  },
  'remix': {
    type: 'npm',
    packageName: '@remix-run/server-runtime',
    docsUrl: 'https://remix.run/docs/en/main',
  },
  'langchain': {
    type: 'python',
    pythonPackage: 'langchain',
    docsUrl: 'https://python.langchain.com/docs/get_started',
    apiDocsUrl: 'https://api.python.langchain.com/en/latest/',
    repo: 'langchain-ai/langchain',
    githubDocsDir: 'docs/docs',
    docsSections: [
      'get_started',
      'modules',
      'integrations',
      'guides',
      'ecosystem',
      'api_reference'
    ]
  },
  'langchain-js': {
    type: 'npm',
    packageName: 'langchain',
    docsUrl: 'https://js.langchain.com/docs/',
    apiDocsUrl: 'https://api.js.langchain.com/index.html',
    repo: 'langchain-ai/langchainjs',
    githubDocsDir: 'docs/docs'
  },
  'fastapi': {
    type: 'python',
    pythonPackage: 'fastapi',
    docsUrl: 'https://fastapi.tiangolo.com/',
    repo: 'tiangolo/fastapi',
    githubDocsDir: 'docs',
    docsSections: [
      'tutorial',
      'advanced',
      'reference'
    ]
  },
};

// File where we'll store the registry
const DATA_DIR = join(process.cwd(), 'data');
const REGISTRY_FILE = join(DATA_DIR, 'framework-registry.json');

/**
 * Initialize the registry storage directory
 */
function initializeStorage(): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
      logger.info('Created data directory for framework registry');
    }
  } catch (error) {
    logger.error('Failed to create data directory for framework registry', {error});
    // Continue without persistence in case of directory creation failure
  }
}

/**
 * Load the framework registry from disk
 * If the file doesn't exist, returns the default frameworks
 */
function loadRegistry(): FrameworkRegistry {
  try {
    initializeStorage();
    
    if (!existsSync(REGISTRY_FILE)) {
      logger.info('Registry file not found, using default frameworks');
      return {...DEFAULT_FRAMEWORKS};
    }
    
    const data = readFileSync(REGISTRY_FILE, 'utf-8');
    const loadedRegistry = JSON.parse(data);
    
    // Restore any non-serializable properties (like functions)
    Object.keys(loadedRegistry).forEach(framework => {
      if (loadedRegistry[framework].customVersionExtractor) {
        // We can't serialize functions, so we need to restore them from defaults if they exist
        if (
          DEFAULT_FRAMEWORKS[framework] && 
          DEFAULT_FRAMEWORKS[framework].customVersionExtractor
        ) {
          loadedRegistry[framework].customVersionExtractor = 
            DEFAULT_FRAMEWORKS[framework].customVersionExtractor;
        } else {
          // If we don't have a default, we'll need to drop this property
          delete loadedRegistry[framework].customVersionExtractor;
        }
      }
    });
    
    logger.info(`Loaded ${Object.keys(loadedRegistry).length} frameworks from registry file`);
    return loadedRegistry;
  } catch (error) {
    logger.error('Failed to load framework registry from disk', {error});
    return {...DEFAULT_FRAMEWORKS};
  }
}

/**
 * Save the framework registry to disk
 */
export function saveRegistry(registry: FrameworkRegistry): void {
  try {
    initializeStorage();
    
    // We need to remove non-serializable properties before saving
    const serializableRegistry = JSON.parse(JSON.stringify(registry));
    
    writeFileSync(
      REGISTRY_FILE, 
      JSON.stringify(serializableRegistry, null, 2), 
      'utf-8'
    );
    
    logger.info(`Saved ${Object.keys(registry).length} frameworks to registry file`);
  } catch (error) {
    logger.error('Failed to save framework registry to disk', {error});
    // Continue without persistence in case of save failure
  }
}

/**
 * The registry of framework documentation sources
 * Loaded from disk or initialized with defaults
 */
export const FRAMEWORK_REGISTRY: FrameworkRegistry = loadRegistry();