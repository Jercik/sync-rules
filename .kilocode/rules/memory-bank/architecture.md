# System Patterns: sync-agent-rules

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
  - Clear exit codes communicate results (0=success, 1=conflicts, 2=error)
  - Interactive confirmation prompts for user decisions

### 2. Scanning Layer (`scan.ts`)

- **Responsibility**: File discovery and content hashing
- **Key Patterns**:
  - Serial hashing for simplicity
  - Glob pattern expansion for flexible file matching
  - Configurable exclusion patterns with sensible defaults
  - Pattern processing for comprehensive directory exclusion
  - Graceful error handling for individual file failures

### 3. Merge Layer (`merge.ts`)

- **Responsibility**: File comparison and conflict resolution
- **Key Patterns**:
  - Strategy pattern simplified to single VS Code approach
  - Three-way merge using temporary base files
  - Automatic fallback from `git merge-file` to VS Code

### 4. Multi-Sync Layer (`multi-sync.ts`)

- **Responsibility**: Multi-project synchronization orchestration
- **Key Patterns**:
  - Content-based comparison using SHA-1 hashes
  - Automatic skip for files with identical content across all projects
  - Interactive user prompts for file decisions
  - Support for project-specific local files (_.local._ pattern)

### 5. Utilities (`utils/`)

- **Core utilities** (`core.ts`): Logging, hashing, file operations
- **Git integration** (`git.ts`): Command execution with proper error handling
- **VS Code integration** (`vscode.ts`): Conflict resolution workflow
- **Prompt utilities** (`prompts.ts`): Interactive user input handling (confirm, select, input)

## Data Flow

1. **Input Processing**: CLI validates directories and patterns
2. **File Discovery**: Parallel scanning of source and target directories
3. **Content Analysis**: SHA-1 hashing for change detection
4. **Action Planning**: Determine copy/merge/skip operations
5. **Execution**: Perform operations with user feedback
6. **Conflict Resolution**: Interactive VS Code sessions when needed

## Key Design Decisions

### Merge Strategy Simplification

The tool employs a single merge strategy focused on VS Code integration, which is prepared by `git merge-file` if available. This approach simplifies the process for users while providing a familiar and powerful interface for resolving conflicts.

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
