# Tech: sync-rules

## Technologies, Libraries, and Dependencies

- Runtime: Node.js >=24.0.0 (using native TypeScript execution)
- CLI Framework: Commander.js v14.0.0 (command-line interface)
- File Globbing: Node.js native `fs.glob` (efficient file pattern matching, preferred over external libraries for simplicity and performance)
- Validation: Zod v4.0.5 (TypeScript-first schema validation)
- Testing: Vitest v3.2.4 (stable version)
- Dev Dependencies: TypeScript v5.8.3, Prettier v3.6.2, @types/node v24.0.15, @vitest/coverage-v8 v3.2.4

## Development Environment Setup and Tooling

- ESM module type
- Zero-build: Direct .ts execution via Node's native type stripping (no transpilation needed)
- package.json: bin configured for sync-rules command, engines >=24.0.0
- Scripts configured: test, test:watch, test:coverage, typecheck, format
- Vitest config: Coverage enabled with @vitest/coverage-v8
- Installation: npm install (dependencies already configured)
- Testing: Package can be linked with npm link for global execution testing
- TypeScript configured with tsconfig.json for type checking (noEmit mode)

## Technical Constraints and Environment Specifics

- OS: Agnostic (uses ~ for home dir)
- Constraints: No internet/build steps; file sizes <1MB; absolute paths in config
- Versions: Pin to Node >=24.0 for native TypeScript execution and fs.glob stability
- Module system: ESM only (no CommonJS support)
- Direct TypeScript execution without transpilation

## Integration Details

- Internal: File system only (central repo, project paths, config file).
- No external APIs/services.
