// Script to process documentation files and add them to the search index
import { join } from 'path';
import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';

async function main() {
  console.log('Processing documentation files...');
  
  const framework = 'fastapi';
  const version = '0.115.11';
  
  const basePath = join('./docs', framework, version);
  if (!existsSync(basePath)) {
    console.error(`No documentation found at ${basePath}`);
    return;
  }
  
  // Get all HTML files in the directory
  const files = readdirSync(basePath)
    .filter(file => file.endsWith('.html'))
    .map(file => join(basePath, file));
  
  console.log(`Found ${files.length} HTML files to process`);
  
  if (files.length === 0) {
    console.log('No HTML files found to process');
    return;
  }
  
  // Import modules dynamically to avoid ESM vs CommonJS issues
  const { processDocFiles, createDocIndex } = await import('./src/tools/docs-fetcher/processors.js');
  
  // Process the HTML files
  const processedDir = join(basePath, 'processed');
  const format = 'markdown';
  
  console.log(`Processing files and storing in ${processedDir} as ${format}`);
  try {
    const processedFiles = await processDocFiles(
      files,
      processedDir,
      format,
      framework,
      version
    );
    
    console.log(`Successfully processed ${processedFiles.length} files`);
    
    // Create index
    if (processedFiles.length > 0) {
      const indexPath = await createDocIndex(
        framework,
        version,
        processedFiles,
        processedDir,
        format
      );
      
      console.log(`Created index at ${indexPath}`);
    }
    
    console.log('Processing complete!');
  } catch (error) {
    console.error('Error processing files:', error);
  }
}

main();