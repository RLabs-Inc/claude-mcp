# Claude Code Integration

This module provides integration between the MCP server and the Claude Code CLI tool, allowing Claude to directly access up-to-date documentation for frameworks and libraries.

## How It Works

The integration works by installing a plugin for Claude Code that provides two main commands:

1. `claude fetch-docs <framework>` - Fetches and makes available documentation for a specific framework
2. `claude list-versions <framework>` - Lists all available versions of a framework

When documentation is fetched, it's stored in a format that Claude Code can access when generating code. This ensures that Claude always has access to the latest API references, best practices, and examples.

## Installation

The plugin can be installed via the MCP server's API:

```bash
# Install the plugin
curl -X POST http://localhost:3000/claude-code/install

# Check installation status
curl http://localhost:3000/claude-code/status
```

After installation, you need to activate the plugin by sourcing the activation script:

```bash
source ~/.claude-code/plugins/claude-mcp/activate.sh
```

For permanent activation, add this to your shell profile (`.bashrc`, `.zshrc`, etc.).

## Usage

```bash
# Fetch documentation for a framework
claude fetch-docs langchain

# Fetch a specific version
claude fetch-docs langchain --version 0.0.267

# Limit the number of pages (for faster fetching)
claude fetch-docs langchain --maxpages 20

# List available versions
claude list-versions fastapi
```

## Integration Architecture

The integration works through the following components:

1. **Plugin Registration**: The plugin is registered with Claude Code by setting the `CLAUDE_CODE_PLUGIN_PATH` environment variable
2. **Command Handling**: When a user runs a command like `claude fetch-docs langchain`, the plugin:
   - Checks if documentation is already available locally
   - If not, it fetches it from the original source
   - Processes the documentation into a Claude-friendly format
   - Makes it available to Claude Code for code generation
3. **Documentation Access**: When Claude generates code, it has access to the documentation, allowing it to use the latest APIs correctly

## Configuration

The plugin uses the following configuration:

- Plugin location: `~/.claude-code/plugins/claude-mcp/`
- Server URL: Configured during installation (default: `http://localhost:3000`)

## Troubleshooting

If you encounter issues with the integration:

1. Check if the MCP server is running
2. Verify that the plugin is installed: `curl http://localhost:3000/claude-code/status`
3. Make sure the plugin is activated in your environment
4. Check if the framework is supported by running `claude list-versions <framework>`