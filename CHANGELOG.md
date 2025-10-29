# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2025-10-29

### Added

- Support for syncing global rule targets across projects
- Write `CLAUDE.md` include file instead of using symlinks for better compatibility

### Changed

- Modernized project configuration and tooling

## [5.0.2] - 2025-10-29

### Fixed

- Removed pnpm enforcement from preinstall script

## [5.0.1] - 2025-10-29

### Fixed

- Include tsbuildinfo files in clean script

## [5.0.0] - 2025-10-29

### Breaking Changes

- Removed adapter system in favor of single AGENTS.md standard

### Changed

- Simplified TypeScript project structure by removing tsconfig.node.json

[5.1.0]: https://github.com/Jercik/sync-rules/compare/v5.0.2...v5.1.0
[5.0.2]: https://github.com/Jercik/sync-rules/compare/v5.0.1...v5.0.2
[5.0.1]: https://github.com/Jercik/sync-rules/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/Jercik/sync-rules/releases/tag/v5.0.0
