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
claude docs langchain               # Fetch and use LangChain documentation
claude versions fastapi             # List available FastAPI versions

# List all available tools
claude tools list                   # See all available tools
claude tools info docs-fetcher      # Get information about a specific tool

# Use any tool directly
claude tool:docs-fetcher frameworks # List supported frameworks
```

When you use `claude docs` to fetch documentation for a framework, Claude Code will automatically have access to this documentation when writing code. As you add more tools to the MCP server, they will automatically be available through the Claude Code CLI.

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
// Claude can generate code to fetch and process documentation
const response = await fetch('http://localhost:3000/api/tools/docs-fetcher/fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    framework: 'fastapi',
    storageFormat: 'markdown',
    processContent: true
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
      "processContent": true|false
    }
    ```
  
- `GET /api/tools/docs-fetcher/status/:framework` - Check documentation status

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

1. Edit `src/tools/docs-fetcher/registry.ts` to add the framework configuration:

```typescript
'your-framework': {
  type: 'npm', // or 'python', 'github', 'custom'
  packageName: 'your-package-name', // for npm
  pythonPackage: 'your-package-name', // for python
  docsUrl: 'https://your-framework.dev/docs',
  apiDocsUrl: 'https://api.your-framework.dev',
  repo: 'username/repo', // for GitHub
  docsSections: ['guide', 'api', 'examples']
}
```

2. If needed, create a specialized scraper in `scrapers.ts`

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

## 🔍 Search Functionality

The documentation tool includes a built-in search system that allows Claude to quickly find relevant information:

```bash
# Search the documentation for a specific term
curl -X POST http://localhost:3000/api/tools/docs-fetcher/search \
  -H "Content-Type: application/json" \
  -d '{"query": "state management", "framework": "react"}'
```

Search results include relevant code snippets and context that Claude can use when generating code.

## ✨ Usage Examples

### Fetch React Documentation

```bash
curl -X POST http://localhost:3000/api/tools/docs-fetcher/fetch \
  -H "Content-Type: application/json" \
  -d '{"framework": "react", "processContent": true}'
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
# Fetch latest documentation
claude docs langchain

# Search documentation
claude tool:docs-fetcher search --query "agents" --framework langchain
```

## 🔜 Future Plans

- **Vector Database**: Add embedding and vector search for documentation
- **Auto-Update System**: Periodic checks for new framework versions
- **Code Sample Extraction**: Extract and index code examples
- **Semantic Understanding**: Add semantic parsing of documentation content
- **CLI Interface**: Command-line tools for managing documentation

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.