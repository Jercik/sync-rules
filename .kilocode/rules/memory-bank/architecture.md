# System Patterns: sync-rules

## Architecture Overview

The system follows a simple pipeline architecture with clear separation of concerns:

```
CLI Input → Validation → Scanning → Comparison → Action Execution → Results
```

## Core Components

### 1. CLI Layer (`cli.ts`)

- **Responsibility**: Argument parsing, validation, orchestration
- **Key Patterns**:
  - Early validation prevents downstream errors
  - Commander.js provides robust argument handling
  - Configurable exclusion patterns via `--exclude` option
  - Sensible default exclusions (memory-bank, node_modules, .git, CLAUDE.md)
  - Clear exit codes communicate results (0=success, 1=errors, 2=fatal error)
  - Interactive confirmation prompts for user decisions

### 2. Scanning Layer (`scan.ts`)

- **Responsibility**: File discovery and content hashing for a single project
- **Key Patterns**:
  - **Global .md constraint**: Only markdown files are processed, eliminating system file issues
  - **Warning system**: Alerts users when non-.md patterns are specified
  - **Pattern transformation**: Smart conversion of patterns to .md-only equivalents
  - Serial hashing for simplicity and reliability
  - Glob pattern expansion for flexible file matching
  - Local file detection (*.local.* pattern) for project-specific exclusions
  - Graceful error handling for individual file failures

### 3. Multi-Sync Layer (`multi-sync.ts`)

- **Responsibility**: Multi-project synchronization orchestration
- **Key Patterns**:
  - **Content-based comparison**: SHA-1 hashes for reliable difference detection
  - **Automatic skip**: Files with identical content across all projects
  - **Interactive prompts**: Multiple decision options (newest, specific version, delete-all, skip)
  - **Auto-confirm mode**: Deterministic newest-file selection, never deletes
  - **Local file support**: Project-specific *.local.* files automatically excluded
  - **Delete-all option**: User can choose to remove files from all projects

### 4. Generate Claude Layer (`generate-claude.ts`)

- **Responsibility**: Generate CLAUDE.md by concatenating all rule files
- **Key Patterns**:
  - **Minimal concatenation**: trim + \n\n between files, no added headers
  - **File-internal structure**: Relies on existing headers within each file
  - **Global .md constraint**: Consistent with scanning layer
  - **Pattern respect**: Uses same inclusion/exclusion logic as sync
  - **Interactive/auto modes**: Prompts per project or auto-generates based on flags
  - **Auto-generated file**: Always overwrites existing CLAUDE.md, manual edits will be lost
  - **Clear warnings**: Generated file includes prominent warning about manual edits

### 5. Discovery Layer (`discovery.ts`)

- **Responsibility**: Auto-discover projects with rule files in directory trees
- **Key Patterns**:
  - **Smart detection**: Uses same .md constraint as scanning
  - **Pattern matching**: Supports custom rule patterns for discovery
  - **Exclusion handling**: Respects common exclusions (node_modules, .git)

### 6. Utilities (`utils/`)

- **Core utilities** (`core.ts`): 
  - Logging, hashing, file operations, path normalization
  - **NEW**: Shared pattern transformation logic (`generateEffectiveMdPatterns`)
  - **NEW**: Post-processing filter (`filterMdFiles`) for additional safety
  - **NEW**: Path security validation (`validatePathSecurity`) preventing traversal attacks
- **Prompt utilities** (`prompts.ts`): Interactive user input handling (confirm, select, input)
- **Formatters** (`formatters.ts`): Time formatting for user-friendly output

### 7. Test Infrastructure (`tests/`)

- **Test Helpers** (`helpers/cli-runner.ts`): CLI spawning with input simulation
  - `runCLI()`: Basic command execution with args
  - `runCLIWithInput()`: Simulates interactive user input via stdin
  - **NEW**: `runCLIInteractive()`: Handles sequential prompts by waiting for specific text
  - Case-insensitive output assertions for cross-platform compatibility
- **All tests passing**: Previously skipped interactive CLAUDE.md generation tests now work
  - Fixed bug where CLAUDE.md generation was skipped when no sync needed
  - New interactive runner properly handles dual-prompt scenarios

## Data Flow

1. **Input Processing**: CLI validates directories and patterns, applies .md constraints and security checks
2. **File Discovery**: Parallel scanning of all project directories with .md filtering
3. **Content Analysis**: SHA-1 hashing for reliable change detection
4. **Decision Making**: Interactive prompts or auto-confirm logic for conflict resolution
5. **Action Planning**: Determine copy/add/delete/skip operations based on user decisions
6. **Execution**: Perform file operations (copy, delete) based on the approved plan
7. **CLAUDE.md Generation**: Optional concatenation of all rule files post-sync

## Key Design Decisions

### Conflict Resolution Strategy

The tool does not merge file contents. Instead, it resolves conflicts by designating one version of a file as the "source of truth," which then overwrites all other versions.

**Interactive Mode (Default)**:
- User prompted with multiple options:
  - Use newest version (by modification date)
  - Use version from specific project
  - Delete file from all projects
  - Skip (leave as-is)
- Clear prompts show file paths, dates, and content previews

**Non-Interactive Mode (`--auto-confirm`)**:
- Automatically selects file with most recent modification timestamp
- **Never deletes files** - only copies/updates
- Deterministic behavior for automated workflows
- Logs decisions for transparency

### Error Handling Philosophy

- **Fail Fast**: Validate inputs early
- **Graceful Degradation**: Skip problematic files with warnings
- **Clear Communication**: Specific error messages with suggested actions

### File Safety

- **Controlled Deletion**: Only in interactive mode with explicit user choice
- **Auto-confirm safety**: Never deletes files in automated mode
- **Dry Run Support**: Preview all changes before execution with `--dry-run`
- **Local file preservation**: *.local.* files never synced or deleted
- **Backup Strategy**: Rely on user's existing version control (Git recommended)

## Performance Considerations

- **Serial Processing**: Simple sequential file hashing for reliability
- **Memory Management**: File size warnings for large files
- **I/O Optimization**: Efficient glob patterns and minimal file reads
