# Claude MCP (Master Control Program)

A powerful server-based tooling system designed to extend Claude's code generation capabilities with access to the latest documentation and resources.

## 🌟 Overview

Claude MCP is a modular server that hosts tools to enhance Claude's ability to work with modern frameworks and libraries. By providing Claude with access to up-to-date documentation and APIs, it ensures that generated code always follows the latest best practices and utilizes the most recent features.

The system can be deployed in two main modes:

1. **Personal Mode**: Run locally on your machine to enhance your own Claude Code experience
2. **Shared Mode**: Deploy as a service that can be accessed by multiple users or teams

You can add your own custom tools or use those contributed by the community.

## 🛠️ Tools

The MCP system is designed to host multiple specialized tools. Currently implemented:

### 1. Documentation Fetcher

Discovers, fetches, and processes the latest documentation for frameworks and libraries:

- **Version Detection**: Automatically detects the latest version from npm, PyPI, or GitHub
- **Documentation Scraping**: Uses headless browsers to scrape official documentation sites
- **Content Processing**: Extracts relevant content and converts to structured formats (JSON/Markdown)
- **API Reference Handling**: Separately processes API documentation for comprehensive coverage
- **Rate Limiting Awareness**: Intelligent rate limiting to respect website policies
- **Smart Crawling**: Prioritizes important documentation pages and adapts to site structure

Supported frameworks include:
- **LangChain** (Python and JavaScript)
- **FastAPI**
- **React, Vue, Angular, Svelte**
- **Express, Next.js, Hono, Remix**
- And more can be easily added...

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) for fast JavaScript/TypeScript execution

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-mcp.git
cd claude-mcp

# Install dependencies
bun install
```

### Running the Server

```bash
# Development mode (with hot reloading)
bun dev

# Production mode
bun start
```

The server runs at http://localhost:3000 by default.

### Deployment Options

#### 1. Personal/Local Use (Recommended)

For personal use, simply run the server locally. No authentication or rate limiting is applied by default:

```bash
# Start the server in development mode
bun dev
```

#### 2. Shared Team Server

For a shared server within a team, you might want basic authentication:

```bash
# Create .env file with basic settings
echo "NODE_ENV=production\nAPI_KEY=your-secret-key" > .env

# Start the server
bun start
```

#### 3. Public Deployment

For a public-facing service, enable all security features:

```bash
# Configure with all security features
echo "NODE_ENV=production\nAPI_KEY=strong-random-key\nRATE_LIMIT_ENABLED=true" > .env

# Start the server
bun start
```

#### 4. Docker Deployment

You can also run the MCP server using Docker:

```bash
# Build and run with Docker
docker build -t claude-mcp .
docker run -p 3000:3000 -v ./docs:/app/docs claude-mcp

# Or use Docker Compose
docker compose up
```

#### 5. Dual Deployment (Local + Shared)

You can run both a local instance for personal tools and connect to a shared instance:

```bash
# Run your personal instance on port 3000
bun dev

# In your .zshrc/.bashrc, set up both sources:
export CLAUDE_CODE_PERSONAL_MCP="http://localhost:3000"
export CLAUDE_CODE_TEAM_MCP="https://team-mcp.example.com"
```

This way, you can develop and use your own tools while also accessing the shared team documentation and tools.

## 🔌 Integrating with Claude

### Claude Code CLI Integration

MCP can be installed as a plugin for the Claude Code CLI tool, providing access to all MCP tools:

```bash
# Install the MCP plugin for Claude Code
curl -X POST http://localhost:3000/claude-code/install

# Source the activation script (or add to your .bashrc/.zshrc)
source ~/.claude-code/plugins/claude-mcp/activate.sh

# Use documentation tools
claude fetch-docs langchain               # Fetch and use LangChain documentation
claude list-versions fastapi              # List available FastAPI versions

# List all available tools
claude tools list                         # See all available tools
claude tools info docs-fetcher            # Get information about a specific tool

# Use any tool directly
claude tool:docs-fetcher frameworks       # List supported frameworks
```

When you use `claude fetch-docs` to fetch documentation for a framework, Claude Code will automatically have access to this documentation when writing code. As you add more tools to the MCP server, they will automatically be available through the Claude Code CLI.

### HTTP API Integration

Claude can also interact with the MCP server through HTTP requests. Here are common integration patterns:

### 1. Checking Latest Version

```typescript
// Claude can generate this code to check the latest version of a framework
const response = await fetch('http://localhost:3000/api/tools/docs-fetcher/latest-version', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ framework: 'langchain' })
});
const data = await response.json();
console.log(`Latest version: ${data.latestVersion}`);
```

### 2. Fetching Documentation

```typescript
// Add a new framework to the registry
const addResponse = await fetch('http://localhost:3000/api/tools/docs-fetcher/framework', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    name: 'new-framework',
    type: 'npm',
    packageName: 'new-framework',
    docsUrl: 'https://new-framework.dev/docs'
  })
});

// Fetch documentation for a framework
const response = await fetch('http://localhost:3000/api/tools/docs-fetcher/fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    framework: 'fastapi',
    storageFormat: 'markdown',
    processContent: true,
    maxPages: 20     // Limit the number of pages (faster for testing)
  })
});
const data = await response.json();
console.log(`Documentation saved to: ${data.processedDocsLocation}`);
```

### 3. Documentation Status Check

```typescript
// Claude can check if documentation is already available
const response = await fetch('http://localhost:3000/api/tools/docs-fetcher/status/langchain');
const data = await response.json();

if (data.available && data.upToDate) {
  console.log(`Using cached documentation at version ${data.latestVersion}`);
} else {
  console.log(`Need to fetch latest documentation (version ${data.latestVersion})`);
}
```

## 📚 API Reference

### Base Endpoints

- `GET /` - Server status and available tools list

### Documentation Fetcher Tool

- `GET /api/tools/docs-fetcher/frameworks` - List all supported frameworks
  - Query params:
    - `type`: Filter by type (`all`, `npm`, `python`, `github`, `custom`)

- `POST /api/tools/docs-fetcher/framework` - Add a new framework to the registry
  - Body:
    ```json
    {
      "name": "new-framework",
      "type": "npm",
      "packageName": "new-framework",
      "docsUrl": "https://new-framework.dev/docs",
      "apiDocsUrl": "https://api.new-framework.dev"
    }
    ```

- `DELETE /api/tools/docs-fetcher/framework/:name` - Remove a framework from the registry

- `POST /api/tools/docs-fetcher/latest-version` - Get latest version of a framework
  - Body:
    ```json
    { "framework": "langchain" }
    ```

- `POST /api/tools/docs-fetcher/fetch` - Fetch and process documentation
  - Body:
    ```json
    {
      "framework": "fastapi",
      "storageFormat": "json|markdown",
      "processContent": true|false,
      "maxPages": 20
    }
    ```
  
- `GET /api/tools/docs-fetcher/status/:framework` - Check documentation status

- `POST /api/tools/docs-fetcher/search` - Search documentation
  - Body:
    ```json
    {
      "query": "state management",
      "framework": "react",
      "limit": 10
    }
    ```

## 🔍 Search Functionality

The documentation tool includes a robust search system that allows Claude to quickly find relevant information:

```bash
# Search the documentation for a specific term
curl -X POST http://localhost:3000/api/tools/docs-fetcher/search \
  -H "Content-Type: application/json" \
  -d '{"query": "state management", "framework": "react", "mode": "hybrid"}'
```

The search system supports three modes with automatic fallback:
- `semantic`: Finds content based on meaning using neural embeddings (best for conceptual queries)
- `keyword`: Traditional text search for exact term matches (best for API names)
- `hybrid`: Combines both approaches for comprehensive results (default)

If semantic search is unavailable, the system automatically falls back to keyword search.

Additional search options:
```json
{
  "query": "How to handle state in React components",
  "framework": "react",
  "version": "18.0.0",
  "mode": "hybrid",
  "hybridAlpha": 0.7,
  "limit": 20
}
```

The system includes tools for rebuilding and optimizing search indexes:

```bash
# Rebuild search indexes
curl -X POST http://localhost:3000/api/tools/docs-fetcher/search/rebuild

# Check search stats
curl http://localhost:3000/api/tools/docs-fetcher/search/stats
```

Search results include relevant snippets and context that Claude can use when generating code, making the documentation much more accessible and useful.

## ✨ Usage Examples

### Fetch React Documentation (Small Sample)

```bash
# Get a small sample for testing (5 pages)
curl -X POST http://localhost:3000/api/tools/docs-fetcher/fetch \
  -H "Content-Type: application/json" \
  -d '{"framework": "react", "processContent": true, "maxPages": 5}'
```

### Fetch Complete Documentation

```bash
# Get comprehensive documentation (may take several minutes)
curl -X POST http://localhost:3000/api/tools/docs-fetcher/fetch \
  -H "Content-Type: application/json" \
  -d '{"framework": "fastapi", "processContent": true, "maxPages": 100}'
```

### Check Latest FastAPI Version

```bash
curl -X POST http://localhost:3000/api/tools/docs-fetcher/latest-version \
  -H "Content-Type: application/json" \
  -d '{"framework": "fastapi"}'
```

### Use with Claude Code CLI

After [installing the Claude Code plugin](#claude-code-cli-integration):

```bash
# Fetch latest documentation (small sample for testing)
claude fetch-docs langchain --maxpages 5

# Add a new framework interactively (via CLI)
bun docadd add

# Or fetch documentation for a new framework directly
bun docadd fetch fastapi --max-pages 20

# List available frameworks
claude tool:docs-fetcher frameworks

# Search documentation
claude tool:docs-fetcher search --query "agents" --framework langchain
```

## 🧩 Architecture

The system follows a modular architecture:

- **Core Server**: Built with Hono and Bun for high performance
- **Tool Registry**: Central registry for managing and loading tools
- **Individual Tools**: Each with its own router, services, and functionality

### Directory Structure

```
/
├── src/
│   ├── index.ts          # Main server entry point
│   ├── lib/
│   │   └── tool-registry.ts # Tool management
│   ├── types/
│   │   └── tool.ts       # Type definitions
│   └── tools/
│       └── docs-fetcher/ # Documentation fetcher tool
│           ├── index.ts     # Routes and endpoints 
│           ├── service.ts   # Core functionality
│           ├── registry.ts  # Framework registry
│           ├── scrapers.ts  # Website scrapers
│           └── processors.ts # Content processors
├── docs/                 # Stored documentation
├── package.json
└── tsconfig.json
```

## 🔧 Extending the System

### Adding a New Framework to Docs Fetcher

Use the interactive CLI tool to add a new framework:

```bash
# Run the documentation management tool
bun docadd add

# Follow the interactive prompts to add details about the framework
```

The CLI will guide you through the following prompts:
1. Framework name (e.g., react, vue, fastapi)
2. Framework type (NPM Package, Python Package, GitHub Repository, or Custom)
3. Type-specific information (package name, Python package, or GitHub repo)
4. Main documentation URL
5. Whether the framework has separate API documentation (and the URL if applicable)
6. Option to fetch documentation for the framework immediately

You can also use these additional commands:

```bash
# Fetch documentation for an existing framework
bun docadd fetch fastapi --max-pages 20

# List all registered frameworks
bun docadd list

# List frameworks of a specific type
bun docadd list --type npm

# Remove a framework from the registry
bun docadd remove vue
```

All registry changes are automatically saved to disk and will persist between server restarts.

### Creating a New Tool

1. Copy the tool template directory:
   ```bash
   cp -r src/tools/tool-template src/tools/your-tool-name
   ```

2. Implement your tool using the template:

```typescript
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createToolTemplate } from '../../lib/tool-registry';

// Define validation schemas
const exampleSchema = z.object({
  parameter: z.string().min(1)
});

// Create your tool with the template
const yourTool = createToolTemplate({
  name: 'your-tool-name',
  description: 'What your tool does',
  version: '0.1.0',
  setupRoutes: (router) => {
    // Add your endpoints
    router.post(
      '/example',
      zValidator('json', exampleSchema),
      async (c) => {
        const { parameter } = c.req.valid('json');
        
        // Your implementation here
        
        return c.json({ success: true, result: 'Done!' });
      }
    );
    
    return router;
  }
});

export default yourTool;
```

3. Register the tool in `src/lib/tool-registry.ts`:
   ```typescript
   import yourTool from '../tools/your-tool-name';
   
   const tools: Record<string, Tool> = {
     'docs-fetcher': docsFetcher,
     'your-tool-name': yourTool,
     // ...
   };
   ```

4. Your tool will automatically be available via the Claude Code CLI:
   ```bash
   claude tool:your-tool-name example
   ```

## 🔜 Future Plans

- **Vector Database Optimization**: Improve vector search for better semantic understanding
- **Auto-Update System**: Periodic checks for new framework versions
- **Code Sample Extraction**: Extract and index code examples
- **Semantic Understanding**: Enhance semantic parsing of documentation content
- **Extended Language Support**: Support for filtering and processing non-English documentation
- **Memory Optimization**: Reduce memory footprint for large documentation sets
- **Cloud Deployment**: Support for cloud deployment and scaling

## 🔧 Advanced Configuration

### Rate Limiting and Scraping Options

The documentation fetcher includes advanced configuration options to control scraping behavior:

```
# Set delay between scraping requests (milliseconds)
SCRAPER_REQUEST_DELAY=2000

# Set maximum concurrent scraping operations
SCRAPER_MAX_CONCURRENT=1

# Control puppeteer browser timeout
PUPPETEER_TIMEOUT=60000

# Enable/disable headless mode for debugging
PUPPETEER_HEADLESS=true

# GitHub API token for higher rate limits
GITHUB_TOKEN=your_github_token

# Content language preferences (default is English-only)
CONTENT_LANGUAGE=en

# Minimum content quality threshold (0-1)
CONTENT_QUALITY_THRESHOLD=0.7
```

These settings help ensure high-quality documentation while respecting website rate limits and prevent being blocked during documentation fetching.

### Language Filtering

By default, the system focuses on English documentation for better quality results:

- Non-English URLs are automatically skipped during crawling
- Content with explicit non-English language tags (`<html lang="es">`) is filtered
- Pages with high percentages of non-Latin characters are detected and filtered

This behavior can be customized by modifying the language patterns in the scraper configuration.

### Semantic Search Configuration

The vector-based semantic search system can be customized with these options:

```
# Search mode (semantic, keyword, hybrid)
SEARCH_DEFAULT_MODE=hybrid

# Default weight between vector and keyword search (0-1, higher = more semantic)
SEARCH_HYBRID_ALPHA=0.7

# Vector dimensions for embeddings (default: 384 for all-MiniLM-L6)
VECTOR_DIMENSIONS=384

# Maximum number of vectors to store
VECTOR_MAX_ELEMENTS=100000
```

You can also select different search modes at query time by specifying the `mode` parameter in search requests.

### Error Handling and Robustness

The system implements several strategies to ensure robustness:

- Graceful fallback from semantic to keyword search when needed
- Automatic recovery and retry for network errors during scraping
- Rate limit detection and exponential backoff
- Detailed logging of all operations for easier debugging
- Memory management for large documentation sets

This ensures that even if parts of the system encounter issues, the overall functionality remains available to Claude for code generation tasks.

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.