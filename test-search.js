// Simple script to test the search functionality
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function main() {
  console.log('Waiting 2 seconds for the server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Testing search functionality...');
  
  try {
    // Get search stats
    const statsResponse = await fetch('http://localhost:3000/api/tools/docs-fetcher/search/stats');
    const stats = await statsResponse.json();
    console.log('Search stats:', JSON.stringify(stats, null, 2));
    
    // Try a semantic search query for FastAPI
    const searchResponse = await fetch('http://localhost:3000/api/tools/docs-fetcher/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'How to create an API',
        framework: 'fastapi',
        mode: 'semantic',
        limit: 3
      })
    });
    
    const searchResults = await searchResponse.json();
    console.log('Semantic search results for FastAPI:', JSON.stringify(searchResults, null, 2));
    
    // Try a keyword search query for FastAPI
    const keywordResponse = await fetch('http://localhost:3000/api/tools/docs-fetcher/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'fastapi',
        framework: 'fastapi',
        mode: 'keyword',
        limit: 3
      })
    });
    
    const keywordResults = await keywordResponse.json();
    console.log('Keyword search results for FastAPI:', JSON.stringify(keywordResults, null, 2));
    
    // Try a hybrid search query
    const hybridResponse = await fetch('http://localhost:3000/api/tools/docs-fetcher/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'web application',
        framework: 'fastapi',
        mode: 'hybrid',
        hybridAlpha: 0.7,
        limit: 3
      })
    });
    
    const hybridResults = await hybridResponse.json();
    console.log('Hybrid search results:', JSON.stringify(hybridResults, null, 2));
    
  } catch (error) {
    console.error('Error testing search:', error.message);
  }
}

main();