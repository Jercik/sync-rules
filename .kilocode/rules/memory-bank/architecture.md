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
  - Sensible default exclusions (memory-bank, node_modules, .git, .DS_Store)
  - Clear exit codes communicate results (0=success, 1=errors, 2=fatal error)
  - Interactive confirmation prompts for user decisions

### 2. Scanning Layer (`scan.ts`)

- **Responsibility**: File discovery and content hashing for a single project
- **Key Patterns**:
  - Serial hashing for simplicity
  - Glob pattern expansion for flexible file matching
  - Configurable exclusion patterns with sensible defaults
  - Pattern processing for comprehensive directory exclusion
  - Graceful error handling for individual file failures

### 3. Multi-Sync Layer (`multi-sync.ts`)

- **Responsibility**: Multi-project synchronization orchestration
- **Key Patterns**:
  - Content-based comparison using SHA-1 hashes
  - Automatic skip for files with identical content across all projects
  - Interactive user prompts for file decisions
  - Support for project-specific local files (_.local._ pattern)

### 5. Utilities (`utils/`)

- **Core utilities** (`core.ts`): Logging, hashing, file operations
- **Prompt utilities** (`prompts.ts`): Interactive user input handling (confirm, select, input)

## Data Flow

1. **Input Processing**: CLI validates directories and patterns
2. **File Discovery**: Parallel scanning of source and target directories
3. **Content Analysis**: SHA-1 hashing for change detection
4. **Action Planning**: Determine copy/add/delete/skip operations based on user decisions. This includes an option to delete a file from all projects.
5. **Execution**: Perform file operations (copy, delete) based on the approved plan

## Key Design Decisions

### Conflict Resolution Strategy

The tool does not merge file contents. Instead, it resolves conflicts by designating one version of a file as the "source of truth," which then overwrites all other versions. The method for choosing the source of truth depends on the mode:

- **Interactive Mode (Default)**: The user is prompted to choose the source of truth. Options include selecting the newest version (by modification date), picking a version from a specific project, or deleting the file from all projects.
- **Non-Interactive Mode (`--auto-confirm`)**: The tool automatically selects the file with the most recent modification timestamp as the source of truth. It will _never_ delete a file in this mode.

### Error Handling Philosophy

- **Fail Fast**: Validate inputs early
- **Graceful Degradation**: Skip problematic files with warnings
- **Clear Communication**: Specific error messages with suggested actions

### File Safety

- **Never Delete**: Preserve all existing files in target
- **Dry Run Support**: Preview changes before execution
- **Backup Strategy**: Rely on user's existing version control

## Performance Considerations

- **Serial Processing**: Simple sequential file hashing for reliability
- **Memory Management**: File size warnings for large files
- **I/O Optimization**: Efficient glob patterns and minimal file reads
