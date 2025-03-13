# Contributing to Claude MCP

Thank you for your interest in contributing to the Claude MCP project! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/claude-mcp.git
   cd claude-mcp
   ```
3. **Install dependencies**:
   ```bash
   bun install
   ```
4. **Create a branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

1. Make your changes
2. Run tests to make sure everything works:
   ```bash
   bun test
   ```
3. Format your code:
   ```bash
   bun lint
   ```
4. Commit your changes with a descriptive commit message
5. Push to your fork
6. Submit a pull request to the main repository

## Adding a New Tool

1. Create a new directory in `src/tools/your-tool-name/`
2. Implement the `Tool` interface from `src/types/tool.ts`
3. Register your tool in `src/lib/tool-registry.ts`
4. Add tests in the `test/` directory
5. Document your tool in the README.md

## Adding a New Framework to the Docs Fetcher

1. Update the framework registry in `src/tools/docs-fetcher/registry.ts`
2. If needed, implement a specialized scraper in `src/tools/docs-fetcher/scrapers.ts`
3. Test that version detection and scraping works correctly

## Code Style Guidelines

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint)
- Add JSDoc comments for public APIs
- Write unit tests for new functionality

## Pull Request Process

1. Ensure your code passes all tests
2. Update documentation if necessary
3. The PR should clearly describe the problem and solution
4. The PR should be linked to an issue describing the bug or feature
5. Request a code review from a maintainer

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.