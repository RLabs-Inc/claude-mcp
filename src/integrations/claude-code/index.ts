import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadTools } from '../../lib/tool-registry';

const execAsync = promisify(exec);

/**
 * Integration with Claude Code CLI tool
 * 
 * This module provides utilities to integrate the MCP server with Claude Code,
 * allowing Claude to access any tools available in the MCP server.
 */

// Path where Claude Code looks for plugins or extensions
const DEFAULT_CLAUDE_CODE_DIR = join(process.env.HOME || '~', '.claude-code');
const PLUGIN_NAME = 'claude-mcp';
const PLUGIN_DIR = join(DEFAULT_CLAUDE_CODE_DIR, 'plugins', PLUGIN_NAME);

/**
 * Generate commands for all available tools in the MCP server
 */
function generateToolCommands(): { name: string; description: string; usage: string }[] {
  const tools = loadTools();
  const commands: { name: string; description: string; usage: string }[] = [];

  // Add docs fetcher commands specifically
  if (tools['docs-fetcher']) {
    commands.push({
      name: 'docs',
      description: 'Access framework documentation',
      usage: 'claude docs <framework> [--version <version>]'
    });

    commands.push({
      name: 'versions',
      description: 'List available versions of a framework',
      usage: 'claude versions <framework>'
    });
  }

  // Add a general command to list all available tools
  commands.push({
    name: 'tools',
    description: 'List all available tools in the MCP server',
    usage: 'claude tools [list|info <tool-name>]'
  });

  // Add a command for each tool in the MCP server
  Object.entries(tools).forEach(([name, tool]) => {
    commands.push({
      name: `tool:${name}`,
      description: tool.description,
      usage: `claude tool:${name} [command]`
    });
  });

  return commands;
}

/**
 * Installs the MCP plugin for Claude Code
 */
export async function installClaudeCodePlugin(serverUrl: string = 'http://localhost:3000'): Promise<void> {
  try {
    // Check if Claude Code is installed
    try {
      await execAsync('which claude');
    } catch (error) {
      throw new Error('Claude Code CLI not found. Please install it first.');
    }

    // Create plugin directory if it doesn't exist
    if (!existsSync(PLUGIN_DIR)) {
      await mkdir(PLUGIN_DIR, { recursive: true });
    }

    // Get all tool commands
    const commands = generateToolCommands();

    // Create plugin manifest
    const manifest = {
      name: PLUGIN_NAME,
      version: '0.1.0',
      description: 'MCP Server integration for Claude Code',
      server: serverUrl,
      commands
    };

    await writeFile(
      join(PLUGIN_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Create plugin executable
    const pluginScript = `#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const serverUrl = '${serverUrl}';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Available commands:');
    ${commands.map(cmd => `console.log('  ${cmd.name} - ${cmd.description}')`).join(';\n    ')};
    console.log('\\nFor more information on a command, run: claude <command> --help');
    process.exit(0);
  }

  const command = args[0];

  // Handle specific commands
  try {
    if (command === 'docs') {
      if (args.includes('--help')) {
        console.log('Usage: claude docs <framework> [--version <version>]');
        console.log('\\nFetch and prepare documentation for a framework or library.');
        process.exit(0);
      }

      const framework = args[1];
      if (!framework) {
        console.error('Error: Framework name required');
        console.log('Usage: claude docs <framework> [--version <version>]');
        process.exit(1);
      }

      // Check if version is specified
      const versionFlag = args.indexOf('--version');
      let version;
      if (versionFlag !== -1 && args.length > versionFlag + 1) {
        version = args[versionFlag + 1];
      }

      // Get docs for the framework
      await fetchDocs(framework, version);
    } 
    else if (command === 'versions') {
      if (args.includes('--help')) {
        console.log('Usage: claude versions <framework>');
        console.log('\\nList available versions of a framework or library.');
        process.exit(0);
      }

      const framework = args[1];
      if (!framework) {
        console.error('Error: Framework name required');
        console.log('Usage: claude versions <framework>');
        process.exit(1);
      }

      // List available versions
      await listVersions(framework);
    }
    else if (command === 'tools') {
      if (args.includes('--help')) {
        console.log('Usage: claude tools [list|info <tool-name>]');
        console.log('\\nList all available tools or get information about a specific tool.');
        process.exit(0);
      }

      const subcommand = args[1] || 'list';
      
      if (subcommand === 'list') {
        await listTools();
      } 
      else if (subcommand === 'info' && args.length > 2) {
        const toolName = args[2];
        await getToolInfo(toolName);
      }
      else {
        console.error('Unknown subcommand. Use "list" or "info <tool-name>"');
        process.exit(1);
      }
    }
    else if (command.startsWith('tool:')) {
      const toolName = command.substring(5);
      const toolArgs = args.slice(1);
      
      // Forward the command to the specific tool
      await callTool(toolName, toolArgs);
    }
    else {
      console.error(\`Unknown command: \${command}\`);
      console.log('Run "claude" without arguments to see available commands.');
      process.exit(1);
    }
  } catch (error) {
    console.error(\`Error: \${error.message}\`);
    process.exit(1);
  }
}

// Documentation tool functions
async function fetchDocs(framework, version) {
  console.log(\`Fetching documentation for \${framework}...\`);
  
  // First check if we already have the docs
  const statusResponse = await fetch(\`\${serverUrl}/api/tools/docs-fetcher/status/\${framework}\`);
  const statusData = await statusResponse.json();
  
  if (!statusData.available || (version && !statusData.versions.some(v => v.version === version))) {
    console.log('Documentation not found locally. Fetching from source...');
    
    // Fetch documentation from source
    const fetchResponse = await fetch(\`\${serverUrl}/api/tools/docs-fetcher/fetch\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        framework,
        storageFormat: 'markdown',
        processContent: true
      })
    });
    
    const fetchData = await fetchResponse.json();
    
    if (fetchData.error) {
      throw new Error(fetchData.error);
    }
    
    console.log(\`Documentation fetched and processed successfully. \${fetchData.fileCount?.processed || 0} files available.\`);
    console.log(\`Location: \${fetchData.processedDocsLocation || fetchData.docsLocation}\`);
    
    // Trigger Claude to index the new documentation
    console.log('Docs are ready for Claude to use!');
    console.log(\`Use this documentation by referencing: \${framework}@\${fetchData.version || 'latest'}\`);
  } else {
    // We already have the docs
    const versionToUse = version || statusData.latestVersion;
    const versionInfo = statusData.versions.find(v => v.version === versionToUse);
    
    console.log(\`Using existing documentation for \${framework} v\${versionToUse}\`);
    console.log(\`\${versionInfo?.fileCount || 0} files available.\`);
    console.log(\`Use this documentation by referencing: \${framework}@\${versionToUse}\`);
  }
}

async function listVersions(framework) {
  const response = await fetch(\`\${serverUrl}/api/tools/docs-fetcher/status/\${framework}\`);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error);
  }
  
  if (!data.available) {
    console.log(\`No documentation available for \${framework}. Checking latest version...\`);
    
    const versionResponse = await fetch(\`\${serverUrl}/api/tools/docs-fetcher/latest-version\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework })
    });
    
    const versionData = await versionResponse.json();
    
    if (versionData.error) {
      throw new Error(versionData.error);
    }
    
    console.log(\`Latest version: \${versionData.latestVersion}\`);
    console.log('Use "claude docs <framework>" to fetch the documentation.');
  } else {
    console.log(\`\${framework} documentation:\`);
    console.log(\`Latest version: \${data.latestVersion}\`);
    console.log('Available versions:');
    
    data.versions.forEach(version => {
      const date = version.fetchedAt ? new Date(version.fetchedAt).toLocaleDateString() : 'unknown date';
      console.log(\`- \${version.version} (\${date}) - \${version.fileCount || 'unknown'} files\`);
    });
    
    if (!data.upToDate) {
      console.log(\`\nA newer version (\${data.latestVersion}) is available. Run "claude docs \${framework}" to fetch it.\`);
    }
  }
}

// General tool management functions
async function listTools() {
  try {
    const response = await fetch(\`\${serverUrl}/\`);
    const data = await response.json();
    
    console.log('Available MCP tools:');
    data.availableTools.forEach(tool => {
      console.log(\`- \${tool}\`);
    });
    
    console.log('\\nTo use a tool, run: claude tool:<tool-name> <command>');
    console.log('For more information about a tool, run: claude tools info <tool-name>');
  } catch (error) {
    console.error('Error connecting to MCP server. Is it running?');
    throw error;
  }
}

async function getToolInfo(toolName) {
  try {
    // Get tool info
    const response = await fetch(\`\${serverUrl}/api/tools/\${toolName}\`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.error(\`Tool "\${toolName}" not found.\`);
        console.log('Use "claude tools list" to see available tools.');
        return;
      }
      throw new Error(\`Failed to get tool info: \${response.statusText}\`);
    }
    
    const data = await response.json();
    
    console.log(\`Tool: \${toolName}\`);
    console.log(\`Description: \${data.description || 'No description available'}\`);
    console.log(\`Version: \${data.version || 'Unknown'}\`);
    
    if (data.commands && data.commands.length > 0) {
      console.log('\\nAvailable commands:');
      data.commands.forEach(cmd => {
        console.log(\`- \${cmd.name}: \${cmd.description}\`);
        if (cmd.usage) {
          console.log(\`  Usage: \${cmd.usage}\`);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching tool information.');
    throw error;
  }
}

async function callTool(toolName, args) {
  try {
    // First, check if the tool exists
    const baseResponse = await fetch(\`\${serverUrl}/\`);
    const baseData = await baseResponse.json();
    
    if (!baseData.availableTools.includes(toolName)) {
      console.error(\`Tool "\${toolName}" not found.\`);
      console.log('Use "claude tools list" to see available tools.');
      return;
    }
    
    // Todo: Implement specific tool command handling based on the tool
    // This would need to be enhanced as we add more tools to the MCP server
    console.log(\`Executing \${toolName} with args: \${args.join(' ')}\`);
    
    // For now, just forward to the appropriate endpoint
    // In the future, we could have a more sophisticated routing mechanism
    const endpoint = \`\${serverUrl}/api/tools/\${toolName}/\${args[0] || ''}\`;
    
    console.log(\`Calling: \${endpoint}\`);
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      console.error(\`Error: \${response.statusText}\`);
      return;
    }
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(\`Error calling tool \${toolName}: \${error.message}\`);
    throw error;
  }
}

main();
`;

    const pluginPath = join(PLUGIN_DIR, 'index.js');
    await writeFile(pluginPath, pluginScript);
    await execAsync(`chmod +x ${pluginPath}`);

    // Create activation script
    const activationScript = `#!/bin/bash
# MCP Server Plugin for Claude Code

# Add plugin to Claude Code path
export CLAUDE_CODE_PLUGIN_PATH="${PLUGIN_DIR}:$CLAUDE_CODE_PLUGIN_PATH"

echo "Claude MCP plugin activated. Available commands:"
echo "  claude docs <framework> - Access framework documentation"
echo "  claude versions <framework> - List available versions of a framework"
echo "  claude tools - List all available tools"
echo "  claude tool:<tool-name> - Use a specific tool"
echo ""
echo "For more information, run: claude --help"
`;

    await writeFile(
      join(PLUGIN_DIR, 'activate.sh'),
      activationScript
    );

    console.log(`Claude Code plugin installed at ${PLUGIN_DIR}`);
    console.log(`To activate, run: source ${join(PLUGIN_DIR, 'activate.sh')}`);
    console.log('You can also add this to your shell profile for permanent activation.');

    return;
  } catch (error) {
    console.error('Failed to install Claude Code plugin:', error);
    throw error;
  }
}

/**
 * Get the current status of the Claude Code integration
 */
export async function getClaudeCodeIntegrationStatus(): Promise<{
  installed: boolean;
  location?: string;
  activated?: boolean;
  availableCommands?: string[];
}> {
  try {
    if (!existsSync(PLUGIN_DIR)) {
      return { installed: false };
    }

    // Check if manifest exists
    const manifestPath = join(PLUGIN_DIR, 'manifest.json');
    if (!existsSync(manifestPath)) {
      return { installed: false };
    }

    // Read manifest to get available commands
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const availableCommands = manifest.commands?.map(cmd => cmd.name) || [];

    // Check if the plugin is in Claude Code's path
    let activated = false;
    try {
      const { stdout } = await execAsync('echo $CLAUDE_CODE_PLUGIN_PATH');
      activated = stdout.includes(PLUGIN_DIR);
    } catch (error) {
      // Ignore error
    }

    return {
      installed: true,
      location: PLUGIN_DIR,
      activated,
      availableCommands
    };
  } catch (error) {
    console.error('Failed to get Claude Code integration status:', error);
    return { installed: false };
  }
}