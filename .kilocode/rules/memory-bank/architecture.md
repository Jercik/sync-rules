# Architecture: sync-rules

## System-Level Design and Component Relationships

- Core: Node.js CLI tool (sync-rules command).
- Key Components:
  - CLI (cli.ts): Parses args, orchestrates flow (FS read -> logic -> FS execute).
  - Config (config.ts): Pure Zod validation of JSON string to config object with path security.
  - Utils (utils.ts): Pure helpers (path normalization, action types, logging, file validation).
  - Glob Logic (globLogic.ts): Pure pattern separation (positive/negative) and path filtering.
  - Filesystem (filesystem.ts): Native Node.js fs.glob operations, markdown file validation.
  - Adapters (adapters/): Modular registry; pure functions generating FS actions from rule contents.

- Relationships: CLI uses FS to load config/raw rules -> Passes data to pure logic (config/glob/adapters) -> Gets actions -> FS executes (or dry-runs).

## Key Design Patterns and Decisions

- Pure Functions: Business logic (config, glob, adapters) is pure for testability—input data, output actions.
- Facade Pattern: FS layer isolates all I/O, enabling 100% coverage with temp dir tests.
- Registry Pattern: Adapters as a Map for extensibility.
- Parallelism: Promise.all for concurrent project processing; serial adapters per project for atomicity.
- Security: Path normalization/validation in utils/FS to prevent traversal.

## Critical Implementation Paths and Data Flows

- Flow: Load config -> For each project (parallel): Glob rules -> Read contents -> Filter -> For each adapter: Generate actions -> Execute.
- Data: Config object -> Rule paths/contents (strings) -> FSAction[] (e.g., {type: 'write', path, content}).

## High-Level Source Code Structure

- src/: cli.ts, config.ts, filesystem.ts, globLogic.ts, utils.ts, adapters/ (index.ts + per-adapter)
- tests/: Per-module .test.ts, integration/ for E2E
- Implemented files:
  - src/utils.ts: Path validation, file checks, logging (100% test coverage)
  - tests/utils.test.ts: 21 comprehensive tests using Vitest
  - src/config.ts: Zod schemas and parseConfig with path validation (100% test coverage)
  - tests/config.test.ts: 27 comprehensive tests including security validation
  - src/globLogic.ts: Pure pattern separation and path filtering (100% test coverage)
  - tests/globLogic.test.ts: 18 comprehensive tests
  - src/filesystem.ts: Native fs.glob operations and file validation (100% test coverage)
  - tests/filesystem.test.ts: 18 integration tests with real filesystem
  - src/cli.ts: Basic Commander.js structure (placeholder)

## Module Integration

- Config-Utils Integration: Project schema uses normalizePath for secure path validation
- Glob-Filesystem Integration:
  - globLogic.ts provides pure pattern logic (separating positive/negative patterns)
  - filesystem.ts uses these patterns with native fs.glob for actual file discovery
  - Empty patterns are filtered to prevent glob errors
  - Results are validated using isValidMdFile from utils.ts
- Security Layer: Path validation happens at parse time, preventing invalid paths from entering system
- Error Handling: Config module throws raw ZodError instances; CLI layer will catch and pretty-print using error.format() or error.issues (colors, bullets, etc.) - keeps presentation layer separate
- Type Safety: Paths automatically normalized to absolute paths via Zod transform
- Native Integration: Uses Node.js 24.4.1+ fs.glob API directly - no external dependencies
