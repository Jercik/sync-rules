# Tech: sync-rules

## Technologies, Libraries, and Dependencies

- Runtime: Node.js v24.4.1 (latest as of July 19, 2025; consider post-July 15 security patches).
- Validation: Zod v4.0.5 (TypeScript-first schema validation).
- Testing: Vitest v3.2.4 (stable; v4.0.0-beta.2 available—evaluate for Vite 6 support if needed).
- No other runtime deps; use native Node APIs (fs.promises, path, os).

## Development Environment Setup and Tooling

- ESM module type.
- Zero-build: Direct .ts execution via Node's native type stripping.
- package.json: bin for CLI, engines >=24.0.0, scripts for vitest/test/coverage.
- Vitest config: Coverage enabled, .ts support.
- Install: npm i zod; npm i -D vitest.

## Technical Constraints and Environment Specifics

- OS: Agnostic (uses ~ for home dir).
- Constraints: No internet/build steps; file sizes <1MB; absolute paths in config.
- Versions: Pin to Node >=24 for fs.glob stability.

## Integration Details

- Internal: File system only (central repo, project paths, config file).
- No external APIs/services.
