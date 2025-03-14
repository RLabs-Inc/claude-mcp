# Claude Helper File

## Project Overview
This project is a Master Control Program (MCP) server that integrates with Claude Code CLI. The primary objective is to extend Claude's capabilities by providing tools that Claude can use directly when generating code.

### Main Purpose
- Provide Claude with access to up-to-date documentation for frameworks and libraries
- Enable Claude to follow current best practices and use the latest APIs
- Integrate seamlessly with Claude Code CLI through a plugin system

### Core Features
- Documentation fetcher tool that scrapes and indexes documentation
- Interactive CLI (`docadd`) for managing framework documentation
- Search functionality for finding information within documentation
- Claude Code integration that allows Claude to use fetched documentation

### Implementation Notes
- Framework registration is persisted to disk in `data/framework-registry.json`
- Documentation is stored in the `docs/` directory, organized by framework and version
- Scrapers automatically extract content from framework documentation sites
- Users interact with the system primarily through `claude fetch-docs <framework>` command

## Build & Test Commands
- Install: `bun install`
- Development server: `bun dev`
- Start server: `bun start`
- Build: `bun build`
- Lint: `bun lint`
- Format: `bun format`
- Typecheck: `bun typecheck`
- Test: `bun test`
- Test single: `bun test -t "test name"`
- Clean: `bun clean`

## Current Progress
- **Framework Registry Persistence** ✅: Framework configurations are now saved to disk
- **Interactive CLI** ✅: Added comprehensive CLI tool for managing frameworks
- **Documentation Fetcher** ✅: Core scraping and processing functionality works
- **Claude Code Integration** ✅: Basic integration established
- **Rate Limiting & Robustness** ✅: Added intelligent rate limiting and robust error handling
- **Site-Aware Scraping** ✅: Enhanced scraper detects documentation site structure
- **Language Filtering** ✅: Implemented filtering for non-English content
- **Search Improvements** ✅: Implemented graceful fallback for search with improved error handling
- **Error Recovery** ✅: System now recovers gracefully from various error conditions

## Known Issues & Improvement Areas
- **Vector Search Persistence**: Vector search falls back to keyword search; needs further debugging
- **Configuration Management**: Inconsistent environment variable access patterns 
- **Framework Registry**: No validation of URLs when adding frameworks
- **Language Filtering**: More sophisticated language detection could improve performance
- **Memory Management**: Potentially high memory usage for large documentation sets

## Code Style Guidelines
- **Language**: TypeScript with strict mode enabled
- **Framework**: Hono for API endpoints
- **Architecture**: Modular tool-based system with registry pattern
- **Imports**: ES Modules (import/export)
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces
- **Error Handling**: Try/catch with explicit error types when possible
- **Documentation**: JSDoc for public functions and interfaces
- **Formatting**: 2-space indentation, trailing commas
- **Validation**: Use Zod for runtime validation
- **Types**: Prefer explicit types, avoid `any` type