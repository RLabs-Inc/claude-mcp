import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { searchIndex } from '../../lib/searchIndex';
import { logger } from '../../lib/logger';

/**
 * Processes raw HTML documentation files to extract useful content
 */
export async function processDocFiles(
  files: string[],
  outputDir: string,
  format: 'json' | 'markdown' = 'json',
  framework?: string,
  version?: string
): Promise<string[]> {
  const processedFiles: string[] = [];
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });
  
  logger.info(`Processing ${files.length} documentation files`, { format, framework, version });
  
  for (const file of files) {
    try {
      // Read the raw HTML file
      const content = await readFile(file, 'utf-8');
      
      // Parse with cheerio to extract useful content
      const $ = cheerio.load(content);
      
      // Remove unnecessary elements
      $('script, style, nav, footer, header, .sidebar, .navigation, .menu, .toc, .search').remove();
      
      // Get the main content
      const mainContent = $('main, article, .content, .documentation, body').first();
      const title = $('h1, h2, title').first().text().trim() || 'Untitled';
      const extractedHtml = mainContent.html() || '';
      
      // Convert HTML to markdown for storage and indexing
      const markdownContent = turndownService.turndown(extractedHtml);
      
      // Determine output path
      const filename = file.split('/').pop() || '';
      const outputPath = join(
        outputDir, 
        format === 'json' 
          ? `${filename.replace('.html', '')}.json` 
          : `${filename.replace('.html', '')}.md`
      );
      
      if (format === 'json') {
        // Convert to JSON structure
        const jsonContent = {
          title,
          html: extractedHtml,
          markdown: markdownContent,
          source: file,
          processedAt: new Date().toISOString()
        };
        
        await writeFile(outputPath, JSON.stringify(jsonContent, null, 2));
      } else {
        // Convert directly to markdown
        const markdown = `# ${title}\n\n${markdownContent}`;
        await writeFile(outputPath, markdown);
      }
      
      // Add to search index if framework and version are provided
      if (framework && version) {
        try {
          await searchIndex.addDocument({
            framework,
            version,
            path: outputPath,
            title,
            content: markdownContent
          });
        } catch (error) {
          logger.error('Failed to add document to search index', { 
            error: error.message,
            file,
            framework,
            version
          });
        }
      }
      
      processedFiles.push(outputPath);
      logger.debug(`Processed ${file} → ${outputPath}`);
    } catch (error) {
      logger.error(`Error processing file`, { file, error: error.message });
    }
  }
  
  logger.info(`Processed ${processedFiles.length} of ${files.length} files successfully`);
  return processedFiles;
}

/**
 * Creates a unified index file of processed documentation
 */
export async function createDocIndex(
  framework: string,
  version: string,
  processedFiles: string[],
  outputDir: string,
  format: 'json' | 'markdown' = 'json'
): Promise<string> {
  // Build the index based on processed files
  const index = {
    framework,
    version,
    generatedAt: new Date().toISOString(),
    fileCount: processedFiles.length,
    files: processedFiles.map(file => ({
      path: file,
      relativePath: file.replace(outputDir, ''),
      title: file.split('/').pop()?.replace(/\.(json|md|html)$/, '') || ''
    }))
  };
  
  // Write the index file
  const indexPath = join(outputDir, `index.${format === 'json' ? 'json' : 'md'}`);
  
  if (format === 'json') {
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  } else {
    // Create markdown index
    const markdown = `# ${framework} Documentation Index (v${version})

Generated at: ${index.generatedAt}
Total files: ${index.fileCount}

## Available Documentation

${index.files.map(file => `- [${file.title}](${file.relativePath})`).join('\n')}
`;
    await writeFile(indexPath, markdown);
  }
  
  return indexPath;
}