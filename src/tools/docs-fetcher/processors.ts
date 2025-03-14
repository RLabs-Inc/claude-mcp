import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { searchIndex } from '../../lib/searchIndex';
import { vectorStore } from '../../lib/vectorStore';
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
  console.log(`Processing ${files.length} documentation files`);
  console.log(`Files: ${files.join(', ')}`);
  
  // Create output directory if it doesn't exist
  try {
    await mkdir(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  } catch (error) {
    logger.error(`Failed to create output directory: ${outputDir}`, { error: error.message });
    console.error(`Failed to create output directory: ${outputDir}`, error);
  }
  
  for (const file of files) {
    try {
      console.log(`Processing file: ${file}`);
      
      // Read the raw HTML file
      const content = await readFile(file, 'utf-8');
      console.log(`Read file content: ${content.length} characters`);
      
      // Parse with cheerio to extract useful content
      const $ = cheerio.load(content);
      
      // Check for non-English content
      const htmlLang = $('html').attr('lang')?.toLowerCase();
      const metaLang = $('meta[http-equiv="Content-Language"]').attr('content')?.toLowerCase();
      const bodyText = $('body').text().slice(0, 500); // Sample for language detection
      
      // Skip if explicitly non-English
      if ((htmlLang && htmlLang !== 'en' && !htmlLang.startsWith('en-')) || 
          (metaLang && metaLang !== 'en' && !metaLang.startsWith('en-'))) {
        logger.warn(`Skipping non-English content (${htmlLang || metaLang}): ${file}`);
        continue;
      }
      
      // Heuristic check for non-Latin content
      const nonLatinChars = (bodyText.match(/[^\x00-\x7F]/g) || []).length;
      const totalChars = bodyText.length;
      
      if (totalChars > 0 && (nonLatinChars / totalChars) > 0.3) { // >30% non-Latin is likely non-English
        logger.warn(`Skipping likely non-English content: ${file} (${Math.round(nonLatinChars / totalChars * 100)}% non-Latin)`);
        continue;
      }
      
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
      
      // Add to search indexes if framework and version are provided
      if (framework && version) {
        try {
          // Add to keyword search index
          await searchIndex.addDocument({
            framework,
            version,
            path: outputPath,
            title,
            content: markdownContent
          });
          
          // Add to vector search index if initialized
          try {
            // Construct URL from the file path if available
            const metaUrl = $('meta[name="source-url"]').attr('content');
            
            // Ensure vector store is initialized
            if (!vectorStore.isInitialized()) {
              logger.info('Vector store not yet initialized, initializing now');
              await vectorStore.initialize();
            }
            
            logger.info(`Adding document "${title}" to vector store`);
            
            const docId = await vectorStore.addDocument({
              framework,
              version,
              path: outputPath,
              title,
              content: markdownContent,
              url: metaUrl || file
            });
            
            logger.info(`Added document to vector store with ID: ${docId}`);
          } catch (vectorError) {
            logger.warn('Failed to add document to vector store (continuing)', { 
              error: vectorError.message,
              file,
              title
            });
          }
        } catch (error) {
          logger.error('Failed to add document to search indexes', { 
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