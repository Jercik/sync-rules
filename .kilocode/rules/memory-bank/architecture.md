# Architecture: sync-rules

## System-Level Design and Component Relationships

- Core: Node.js CLI tool (sync-rules command).
- Key Components:
  - CLI (cli.ts): Parses args, orchestrates flow (FS read -> logic -> FS execute).
  - Config (config.ts): Pure Zod validation of JSON string to config object.
  - Utils (utils.ts): Pure helpers (path normalization, action types, logging).
  - Glob Logic (globLogic.ts): Pure filtering of rule paths.
  - Adapters (adapters/): Modular registry; pure functions generating FS actions from rule contents.
  - Filesystem (filesystem.ts): Thin facade for all FS ops (read, glob, stat, execute actions).

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

- src/: cli.ts, config.ts, filesystem.ts, globLogic.ts, utils.ts, adapters/ (index.ts + per-adapter).
- tests/: Per-module .test.ts, integration/ for E2E.
