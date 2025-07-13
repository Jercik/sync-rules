# Project Context, Design Philosophy & Future Directions: sync-rules

## Current Status

The `sync-rules` project is feature-complete with robust functionality, comprehensive test coverage, and security hardening. All 193 tests pass, confirming stability across all major use cases, edge scenarios, and security boundaries. The tool successfully implements the global .md constraint, minimal CLAUDE.md concatenation, interactive/auto-confirm sync modes, path traversal protection, and recent improvements including TOCTOU race condition fixes, SHA-256 hashing, and 1MB file size limits.

### Key Capabilities
- **Multi-project synchronization** with intelligent conflict resolution
- **Global .md constraint** ensuring clean, consistent rule file handling
- **CLAUDE.md generation** with minimal concatenation for Claude Code integration
- **Interactive and auto-confirm modes** for different workflow preferences
- **Local file support** (*.local.* pattern) for project-specific configurations
- **Conditional rule synchronization** via manifest-based system for applying rules based on project content
- **Comprehensive testing** with 193 tests covering all scenarios including security
- **Path traversal protection** preventing unauthorized access to files outside project boundaries

### Latest Breaking Changes (2025-07-12)

- **Global .md Constraint**: Implemented a breaking change that restricts the tool to only process `.md` files. This eliminates issues with system files like `.DS_Store` and ensures only markdown-based rules are synchronized.
- **Minimal CLAUDE.md Concatenation**: Simplified CLAUDE.md generation to use minimal concatenation (just trim + `\n\n` between files), removing file headers and separators. Output now relies on file-internal headers for structure.
- **Test File Updates**: Updated all test files to use `.md` extensions for rule files (e.g., `.cursorrules.md`, `.clinerules.md`) to align with the new .md-only constraint.
- **Discovery Logic Fixed**: Updated `hasRuleFiles` in discovery.ts to respect the .md constraint, matching scan behavior.
- **Documentation Updated**: README now correctly shows .md-only patterns and examples.
- **User Warnings Added**: Tool now warns users when non-.md patterns are specified.

### Test Suite Comprehensive Update (2025-07-12)

- **Complete Test Alignment**: All 193 tests passing with .md constraint and security
- **Test Coverage Areas**:
  - **CLI Integration**: 13 tests covering all flags and option combinations
  - **Sync Scenarios**: 12 tests covering 2/3/5 project sync, interactive mode, local files
  - **Edge Cases**: 9 tests covering large files, special characters, permissions
  - **Error Handling**: 12 tests covering file system errors, permissions, corruption
  - **CLAUDE.md Generation**: 9 tests all passing, covering concatenation, patterns, dry-run, interactive prompts
  - **Path Security**: 15 tests (9 unit + 6 integration) covering path traversal prevention
  - **Unit Tests**: 96 tests covering scanning, discovery, utilities, multi-sync, security

### Major Bugfixes and Improvements (2025-07-12)

1. **Fixed inconsistent handling of non-.md files in patterns**
   - Extracted shared pattern transformation logic into `generateEffectiveMdPatterns` in core.ts
   - Added post-processing filter `filterMdFiles` to ensure no non-.md files slip through
   - Eliminated ~80 lines of duplicate code between scan.ts and generate-claude.ts

2. **Fixed permission error in CLAUDE.md generation (dry-run mode)**
   - Added proper error handling in cli.ts for dry-run mode
   - Added try-catch wrapper in generateClaudeMd to handle permission errors gracefully
   - Dry-run mode now properly simulates success even when files can't be read

3. **Fixed auto-confirm mode indirect file deletion issue**
   - Added warning system when auto-confirm will add files to projects
   - Warns users that additions may overwrite local changes
   - Suggests using --dry-run first or interactive mode for more control

4. **Fixed discovery failing on deeply nested non-.md files**
   - Changed `deep: 10` to `deep: Infinity` in discovery.ts hasRuleFiles function
   - Now matches scan.ts behavior for consistency

5. **Fixed exit code inconsistency documentation**
   - Clarified that exit code 1 includes both sync errors and CLAUDE.md generation failures
   - Updated documentation to be more precise about what each exit code means

6. **Fixed skipped tests for CLAUDE.md generation prompts**
   - Implemented `runCLIInteractive` helper for handling sequential prompts
   - Fixed bug where CLAUDE.md generation was skipped when no sync was needed
   - Both previously skipped tests now pass

7. **Fixed auto-confirm addition warnings for hidden overwrites**
   - Added file existence check in `generateAutoConfirmedActions` to detect potential overwrites
   - Warns specifically when "add" actions would overwrite existing files (race condition scenario)
   - Enhanced warnings with "WARNING: Auto-confirm will OVERWRITE" for existing files
   - Added stronger recommendation to use --dry-run or interactive mode when overwrites detected
   - Added execution-time warning in `executeAdd` when overwriting existing files

8. **Fixed exit code propagation in CLI for combined sync/generation failures**
   - Changed conditional generation execution to always run when flag is set (not just on sync success)
   - Fixed exit code logic to use `Math.max(exitCode, genExitCode)` instead of overwriting
   - Ensures highest exit code is preserved (1 = error takes precedence over 0 = success)
   - Added comprehensive tests for all combinations of sync/generation success/failure
   - Generation now runs even when sync has errors, providing complete results to users

9. **Enhanced CLAUDE.md documentation to clarify manual edits will be lost**
   - Updated README.md with prominent warning about CLAUDE.md being auto-generated
   - Enhanced warning message in generated CLAUDE.md files (now 3 lines with emoji warning)
   - Updated memory bank files (product.md, architecture.md) to mention overwrite behavior
   - Ensures users understand that manual edits to CLAUDE.md will be lost on regeneration
   - Clear guidance to edit source .md files instead

10. **Added manifest-based conditional rule synchronization**
   - Implemented `.kilocode/manifest.json` and `.kilocode/manifest.local.json` support
   - Rules now sync conditionally based on glob pattern matches in target projects
   - Added Zod validation for type-safe manifest parsing
   - Two-phase sync: manifests sync first, then rules based on conditions
   - New utility modules for enhanced file handling and decision strategies

### Major Improvements (2025-07-13)

1. **Fixed TOCTOU Race Condition**
   - Implemented atomic copy operations using `fs.constants.COPYFILE_EXCL`
   - Added `--force` flag to allow overwriting files created after initial scan
   - Prevents silent overwrites in concurrent environments (CI/CD)
   - Enhanced warnings for potential race condition overwrites

2. **Migrated from SHA-1 to SHA-256**
   - Improved security and collision resistance for file hashing
   - Future-proofing against potential SHA-1 vulnerabilities
   - Updated all tests to expect SHA-256 hash formats

3. **Implemented 1MB File Size Limit**
   - Rule files larger than 1MB are automatically skipped
   - Ensures rule files remain concise and readable
   - Prevents memory issues with unexpectedly large files
   - Clear warning messages when files exceed the limit

4. **Enhanced Dry-Run Mode**
   - Added write permission checks for destination directories
   - Better simulation of potential permission failures
   - More accurate preview of what would happen in real execution

5. **Improved Error Handling**
   - User-friendly error messages for duplicate project names
   - Better Zod validation error formatting for manifest files
   - Graceful handling of invalid manifests (treated as missing)
   - Extracted common error handling functions for consistency

### Critical Security Fix (2025-07-12)

**Path Traversal Vulnerability Fixed**
- **Issue**: `normalizePath` function resolved paths but didn't validate against traversal attacks
- **Risk**: Users could provide paths like `../../../etc/passwd` to access files outside intended directories
- **Fix**: Implemented `validatePathSecurity` function that ensures paths stay within allowed boundaries
- **Coverage**: Added 15 security tests (9 unit + 6 integration) covering various attack vectors
- **Impact**: Prevents unauthorized access in multi-user environments or CI/CD pipelines

- **Quality Improvements**:
  - **Explanatory Comments**: Added "why" comments explaining requirements being tested
  - **Consistent Patterns**: Standardized test structure and naming conventions
  - **Edge Case Coverage**: Non-.md warnings, auto-confirm safety, .md constraint behavior
  - **Assertion Updates**: Minimal concatenation format, graceful error handling
  - **Interactive Testing**: Proper simulation of user input for decision prompts

### Recent Major Refactoring

- **Simplified Scanning Module**: Removed redundant source/target directory model from `scan.ts`. The module now works with a single project directory, eliminating the confusing `ScanResult` interface with identical `sourceFiles` and `targetFiles`.
- **Code Cleanup**: Removed unused functions and interfaces including `validateDirectories`, `createTemporaryFile`, `DeletionInfo`, `SyncPlan`, and the `input` prompt function.
- **Improved Naming**: Renamed `conflicts` to `errors` in the CLI execution results for clarity, as the tool doesn't handle merge conflicts but rather general file operation errors.
- **Delete All Functionality**: Added user option to delete a file from all projects when it's missing from at least one project.
- **Simplified Entry Point**: Removed redundant error handling from bin file as main() already handles all errors.
- **Precise Timestamps**: Enhanced formatTime() to show exact timestamps for file decision contexts while maintaining backward compatibility.

### Architecture Consolidation (Pre-2025-07-12)

- **Interactive Confirmation Implementation**: Fixed critical bug where user confirmation was never requested, violating core design principles. Now properly prompts users for file decisions unless --auto-confirm is set.
- **Identical File Detection**: Improved efficiency by comparing file content (SHA-256 hashes) rather than timestamps. Files with identical content across all projects are now automatically skipped.
- **System File Exclusion**: Previously added `.DS_Store` to default exclusion patterns, now superseded by global .md constraint.
- **Scanning Simplification**: Removed redundant source/target directory model, now works with single project directories.
- **Delete-All Functionality**: Added user option to delete files from all projects when missing from some.

## Design Philosophy

1.  **Simplicity Over Features**: Prioritizing ease of use over advanced configuration options
2.  **Markdown-First**: Global .md constraint ensures clean, consistent rule file handling
3.  **Safe by Default**: Conservative file handling - auto-confirm never deletes, interactive requires explicit confirmation
4.  **Deterministic Automation**: Auto-confirm mode provides predictable newest-file selection for CI/CD workflows
5.  **Native TypeScript**: Leveraging Node.js 23.6+ for zero-build development and deployment
6.  **Comprehensive Testing**: 193 tests ensure reliability across all use cases, edge scenarios, and security boundaries
7.  **Claude Code Integration**: Built-in CLAUDE.md generation with minimal concatenation for optimal Claude interaction

## Current Implementation Patterns

### File Processing Architecture
- **Global .md Constraint**: All file operations filtered to only process markdown files
- **Pattern Transformation**: Smart conversion of user patterns to .md-equivalent patterns
- **Warning System**: User notifications when non-.md patterns are specified
- **Local File Detection**: Automatic exclusion of *.local.* files from synchronization

### User Experience Design
- **Two-Mode Operation**: Interactive (default) and auto-confirm for different workflow needs
- **Clear Decision Points**: Structured prompts with specific options (newest, specific, delete-all, skip)
- **Safety Guarantees**: Auto-confirm never deletes, interactive requires explicit confirmation
- **Progress Feedback**: Real-time logging of scan, sync, and generation phases

### Quality Assurance
- **Comprehensive Testing**: 193 tests covering unit, integration, edge cases, and security
- **Error Handling**: Graceful degradation with informative warnings
- **Cross-Platform**: Consistent behavior across different operating systems
- **Performance**: Efficient file scanning with parallel project processing

## Performance Characteristics

### Current Optimization
- **Parallel Project Scanning**: Multiple projects scanned concurrently for faster discovery
- **Serial Hash Calculation**: Simple sequential approach for reliability over speed
- **Efficient Pattern Matching**: .md constraint reduces file system overhead significantly
- **Smart Skipping**: Identical files automatically excluded from processing
- **Memory Management**: Files larger than 1MB are automatically skipped

### Performance Benchmarks
- **Typical Usage**: 2-5 projects with 10-20 rule files sync in under 2 seconds
- **Large Scale**: 10+ projects with 100+ files complete within 10 seconds
- **Memory Usage**: Minimal footprint, files >1MB automatically skipped

## Project Maturity Status

### Current Completion Level
The project has reached a high level of maturity with comprehensive functionality:

- **Core Features**: Complete implementation of all planned sync capabilities
- **Quality Assurance**: 193 passing tests with full edge case and security coverage
- **Documentation**: Complete README, memory bank, and inline code documentation
- **User Experience**: Polished CLI with clear prompts, warnings, and feedback
- **Architecture**: Clean, maintainable codebase with clear separation of concerns

### Stable Feature Set
- **Multi-project synchronization** with intelligent conflict resolution
- **Global .md constraint** for consistent file handling
- **Interactive and auto-confirm modes** for different workflow preferences
- **CLAUDE.md generation** with minimal concatenation
- **Local file support** for project-specific configurations
- **Conditional rule synchronization** via manifest files
- **Comprehensive error handling** with graceful degradation
- **Path traversal protection** for secure multi-user operation

### Design Decisions (Intentionally Not Included)
- **File content merging**: Tool uses "winner takes all" approach for simplicity
- **Complex configuration files**: CLI flags provide sufficient customization
- **Multiple output formats**: CLAUDE.md serves the primary use case
- **Version control integration**: Users manage through existing Git workflows
- **Real-time watching**: One-time sync fits the typical development workflow
