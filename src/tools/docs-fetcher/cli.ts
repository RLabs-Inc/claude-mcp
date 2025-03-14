#!/usr/bin/env bun

import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import { z } from 'zod';
import { getLatestVersion, fetchDocumentation } from './service';
import { FRAMEWORK_REGISTRY, saveRegistry } from './registry';
import { logger } from '../../lib/logger';

// Set up CLI program
const program = new Command();

program
  .name('docadd')
  .description('Add and fetch documentation for a new framework or library')
  .version('0.1.0');

// Command to add a new framework
program
  .command('add')
  .description('Add a new framework or library to the documentation registry')
  .action(async () => {
    try {
      // Get framework details
      const name = await input({
        message: 'Framework name (e.g., react, vue, fastapi):',
        validate: (value) => {
          if (!value.trim()) return 'Name cannot be empty';
          if (FRAMEWORK_REGISTRY[value.toLowerCase()]) return 'Framework already exists in registry';
          return true;
        }
      });
      
      const type = await select({
        message: 'Framework type:',
        choices: [
          { name: 'NPM Package', value: 'npm' },
          { name: 'Python Package', value: 'python' },
          { name: 'GitHub Repository', value: 'github' },
          { name: 'Custom', value: 'custom' }
        ]
      });
      
      // Get type-specific information
      let packageName, pythonPackage, repo;
      
      if (type === 'npm') {
        packageName = await input({
          message: 'NPM package name:',
          default: name
        });
      } else if (type === 'python') {
        pythonPackage = await input({
          message: 'Python package name:',
          default: name
        });
      } else if (type === 'github') {
        repo = await input({
          message: 'GitHub repository (format: owner/repo):',
          validate: (value) => {
            if (!value.includes('/')) return 'Repository must be in format owner/repo';
            return true;
          }
        });
      }
      
      // Get documentation URLs
      const docsUrl = await input({
        message: 'Main documentation URL:',
        validate: (value) => {
          try {
            new URL(value);
            return true;
          } catch (e) {
            return 'Invalid URL';
          }
        }
      });
      
      const hasApiDocs = await confirm({
        message: 'Does this framework have separate API documentation?',
        default: false
      });
      
      let apiDocsUrl;
      if (hasApiDocs) {
        apiDocsUrl = await input({
          message: 'API documentation URL:',
          validate: (value) => {
            try {
              new URL(value);
              return true;
            } catch (e) {
              return 'Invalid URL';
            }
          }
        });
      }
      
      // Create framework entry
      const frameworkEntry: any = {
        type,
        docsUrl
      };
      
      if (apiDocsUrl) frameworkEntry.apiDocsUrl = apiDocsUrl;
      if (packageName) frameworkEntry.packageName = packageName;
      if (pythonPackage) frameworkEntry.pythonPackage = pythonPackage;
      if (repo) frameworkEntry.repo = repo;
      
      // Add to registry and persist to disk
      FRAMEWORK_REGISTRY[name.toLowerCase()] = frameworkEntry;
      saveRegistry(FRAMEWORK_REGISTRY);
      
      console.log(`\nAdded ${name} to the documentation registry and saved to disk.`);
      
      // Fetch latest version
      try {
        const version = await getLatestVersion(name);
        console.log(`Latest version of ${name}: ${version}`);
        
        const shouldFetch = await confirm({
          message: `Fetch documentation for ${name} ${version}?`,
          default: true
        });
        
        if (shouldFetch) {
          const maxPages = parseInt(await input({
            message: 'Maximum number of pages to fetch (5-100):',
            default: '20',
            validate: (value) => {
              const num = parseInt(value);
              if (isNaN(num) || num < 1) return 'Please enter a valid number';
              return true;
            }
          }));
          
          console.log(`\nFetching documentation for ${name} ${version}...`);
          const result = await fetchDocumentation(name, 'markdown', maxPages);
          
          console.log(`\nDocumentation fetched successfully!`);
          console.log(`- Version: ${result.version}`);
          console.log(`- Files: ${result.files.length}`);
          console.log(`- Location: ${result.path}`);
        }
      } catch (error) {
        console.error(`Error fetching version or documentation: ${error.message}`);
      }
      
      console.log('\nTo use this documentation with Claude Code:');
      console.log(`claude fetch-docs ${name}`);
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

// Command to fetch documentation for an existing framework
program
  .command('fetch <framework>')
  .description('Fetch documentation for an existing framework')
  .option('-v, --version <version>', 'Specific version to fetch')
  .option('-m, --max-pages <pages>', 'Maximum number of pages to fetch', '50')
  .option('-f, --format <format>', 'Storage format (json or markdown)', 'markdown')
  .action(async (framework, options) => {
    try {
      if (!FRAMEWORK_REGISTRY[framework.toLowerCase()]) {
        console.error(`Framework '${framework}' not found in registry.`);
        console.log('Use docadd add to add a new framework first.');
        return;
      }
      
      // Validate and convert options
      const maxPages = parseInt(options.maxPages);
      if (isNaN(maxPages) || maxPages < 1) {
        console.error('Maximum pages must be a positive number');
        return;
      }
      
      const format = ['json', 'markdown'].includes(options.format) 
        ? options.format 
        : 'markdown';
      
      // Get version if not specified
      let version = options.version;
      if (!version) {
        try {
          version = await getLatestVersion(framework);
          console.log(`Latest version of ${framework}: ${version}`);
        } catch (error) {
          console.error(`Error fetching latest version: ${error.message}`);
          return;
        }
      }
      
      console.log(`\nFetching documentation for ${framework} ${version}...`);
      console.log(`Maximum pages: ${maxPages}`);
      
      const result = await fetchDocumentation(framework, format, maxPages);
      
      console.log(`\nDocumentation fetched successfully!`);
      console.log(`- Version: ${result.version}`);
      console.log(`- Files: ${result.files.length}`);
      console.log(`- Location: ${result.path}`);
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

// Command to list all frameworks in the registry
program
  .command('list')
  .description('List all frameworks in the documentation registry')
  .option('-t, --type <type>', 'Filter by framework type')
  .action((options) => {
    const frameworks = Object.entries(FRAMEWORK_REGISTRY)
      .filter(([_, info]) => !options.type || info.type === options.type)
      .map(([name, info]) => ({
        name,
        type: info.type,
        docsUrl: info.docsUrl
      }));
    
    console.log(`\nAvailable frameworks (${frameworks.length}):`);
    
    if (frameworks.length === 0) {
      console.log('No frameworks found.');
      return;
    }
    
    const typeColors: Record<string, string> = {
      npm: '\x1b[32m',    // Green
      python: '\x1b[34m', // Blue
      github: '\x1b[33m', // Yellow
      custom: '\x1b[36m', // Cyan
    };
    
    const reset = '\x1b[0m';
    
    frameworks.forEach(({ name, type, docsUrl }) => {
      const color = typeColors[type] || '';
      console.log(`- ${name} (${color}${type}${reset}): ${docsUrl}`);
    });
  });

// Command to remove a framework from the registry
program
  .command('remove <framework>')
  .description('Remove a framework from the documentation registry')
  .action(async (framework) => {
    try {
      const frameworkKey = framework.toLowerCase();
      
      if (!FRAMEWORK_REGISTRY[frameworkKey]) {
        console.error(`Framework '${framework}' not found in registry.`);
        return;
      }
      
      const confirmRemove = await confirm({
        message: `Are you sure you want to remove ${framework} from the registry?`,
        default: false
      });
      
      if (!confirmRemove) {
        console.log('Operation cancelled.');
        return;
      }
      
      // Remove from registry
      delete FRAMEWORK_REGISTRY[frameworkKey];
      saveRegistry(FRAMEWORK_REGISTRY);
      
      logger.info(`Removed framework from registry: ${framework}`);
      console.log(`\nRemoved ${framework} from the documentation registry.`);
      console.log('Note: This does not delete any previously fetched documentation files.');
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program.parse();