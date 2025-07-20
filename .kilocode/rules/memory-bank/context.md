# Context: sync-rules

## Current Work Focus and Priorities

- Phase 1 (Utils Module) - COMPLETED with 100% test coverage
- Phase 2 (Config Module) - COMPLETED with 100% test coverage
- Phase 2.5 (Config-Utils Integration) - COMPLETED
- Phase 2.6 (Error Handling Simplification) - COMPLETED
- Phase 3 (Glob Logic) - COMPLETED with 100% test coverage
- Phase 4 (Adapter System) - COMPLETED with 100% test coverage
- TDD approach established and proven successful
- Ready to proceed with Phase 5: Filesystem Execution

## Recent Changes and Impacts

Phase 4 Completed (Adapter System):

- Implemented adapters directory structure with three adapters:
  - claude.ts: Concatenates all rules into CLAUDE.md with separators
  - gemini.ts: Identical to claude but outputs to GEMINI.md
  - kilocode.ts: Writes individual files to .kilocode/rules directory
- Created adapter registry system with:
  - AdapterInput type: { projectPath, rules: Array<{path, content}> }
  - AdapterFunction type: Pure function returning FSAction[]
  - getAdapter function: Retrieves adapter by name with validation
- Added readRuleContents to filesystem.ts:
  - Reads multiple files asynchronously with error handling
  - Preserves UTF-8 content and whitespace exactly
  - Skips failed reads with console error logging
- Updated cli.ts with adapter imports (placeholder for Phase 6)
- Achieved 100% test coverage for all adapter code (35 new tests)
- All adapters follow pure function pattern - no side effects

Phase 3 Completed (Glob Logic for Rule Filtering):

- Implemented globLogic.ts with pure functions:
  - separatePatterns: Separates positive/negative patterns, filters empty patterns, defaults to \*_/_.md
  - filterUniquePaths: Removes duplicates and sorts for deterministic results
  - PatternSeparationResult interface with clear JSDoc documentation
- Implemented filesystem.ts with I/O operations:
  - globRulePaths: Uses native Node.js fs.glob (stable in v24.4.1+) - no external dependencies
  - filterValidMdPaths: Validates markdown files using existing isValidMdFile
  - Uses Array.fromAsync for cleaner async iteration
- Key improvements made:
  - Removed Windows-specific handling (macOS-only tool)
  - Updated tsconfig.json lib from "es2022" to "esnext" for Array.fromAsync support
  - Made separatePatterns robust by filtering empty patterns to prevent glob errors
  - Added comprehensive JSDoc documentation
- Achieved 100% test coverage with 36 tests using real filesystem operations
- Integration with native Node.js glob provides excellent performance for up to 100 rules

Phase 2.6 Completed (Error Handling Simplification):

- Removed custom multi-error formatting (~30 lines of code eliminated)
- Simplified parseConfig to use Config.safeParse() pattern (8 lines of logic)
- Updated all tests to expect ZodError instances instead of custom error messages
- Embraced "treat all errors equally" principle - no special cases
- CLI layer will be responsible for pretty-printing ZodError using error.format() or error.issues
- Maintained 100% test coverage and type safety

Phase 2.5 Completed (Config-Utils Integration):

- Integrated normalizePath into Project schema using Zod transform
- Added path security validation at schema level:
  - Prevents path traversal attacks (../ patterns)
  - Enforces allowed directory restrictions
  - Validates paths before they enter the system
- Added 3 new security tests for invalid paths
- Maintained 100% test coverage for both modules (48 total tests)
- Paths are now automatically normalized to absolute paths

Phase 2 Completed:

- Implemented config.ts with Zod v4 validation:
  - Config, Project, and Adapter schemas (no "Schema" suffix per convention)
  - parseConfig function with user-friendly error messages
  - Applied experienced developer's feedback for simpler implementation
- Fixed all test regex patterns to match actual error messages
- Added comprehensive multi-error tests
- Achieved 100% test coverage (27 tests passing)

Phase 1 Completed:

- Implemented utils.ts with three core functions:
  - normalizePath: Secure path validation preventing traversal attacks
  - isValidMdFile: Validates .md files under 1MB (case-insensitive)
  - logMessage: Conditional verbose logging
- Created FSAction discriminated union type for future filesystem operations
- Achieved 100% test coverage with 21 comprehensive tests

## Next Steps and Open Questions

- Phase 5: Filesystem Execution
  - Create executeActions function to process FSAction[]
  - Implement dry-run mode for preview
  - Add file backup/rollback capability
  - Handle concurrent file operations safely
- Phase 6: Complete CLI integration
  - Wire up all components in cli.ts
  - Add command-line argument parsing
  - Implement verbose/quiet modes
  - Add progress indicators for large operations
- Resolved: Glob negation patterns handled via fs.glob's exclude option
- Open question: Should there be a config file watcher for auto-sync mode?
