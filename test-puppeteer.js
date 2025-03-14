const puppeteer = require('puppeteer');

async function testPuppeteer() {
  console.log("Testing puppeteer...");
  console.log("Creating browser...");
  
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      timeout: 60000,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log("Browser created successfully");
    
    const page = await browser.newPage();
    console.log("Page created successfully");
    
    console.log("Navigating to example.com...");
    await page.goto('https://example.com', { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log("Navigation successful");
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    await browser.close();
    console.log("Browser closed successfully");
  } catch (error) {
    console.error("Error:", error);
  }
}

testPuppeteer();