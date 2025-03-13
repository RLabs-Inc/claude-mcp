# Claude Helper File

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