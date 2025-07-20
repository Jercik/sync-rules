# Architecture: sync-rules

## System-Level Design and Component Relationships

sync-rules is a Node.js CLI tool that propagates AI coding rules from a central repository to multiple projects. The architecture emphasizes simplicity, testability, and performance through clear separation of concerns.

### Core Components:

1. **CLI Layer** (`cli.ts`): Commander.js-based interface that orchestrates the entire flow
2. **Configuration** (`config.ts`): Zod-based validation with integrated security checks
3. **Utilities** (`utils.ts`): Core helpers for file checks and logging (delegates path validation to PathGuard)
4. **PathGuard** (`pathGuard.ts`): Dedicated security utility for path validation, normalization, and allowed root management
5. **Glob Logic** (`globLogic.ts`): Pure functions for pattern processing
6. **Filesystem** (`filesystem.ts`): I/O operations using native Node.js APIs
7. **Adapters** (`adapters/`): Pluggable transformers for different AI tools
8. **Execution** (`execution.ts`): Filesystem operation executor with dependency resolution and centralized path normalization
9. **Reporting** (`reporting.ts`): Formatted output generation for execution results with colored terminal output
10. **Constants** (`constants.ts`): Shared configuration values including central repository paths

### Data Flow:

```
CLI → Read Config → Validate → For Each Project (parallel):
  → Glob Rules → Read Contents → Apply Adapters → Execute Actions
```

## Key Design Patterns and Decisions

### Pure Functions

All business logic is implemented as pure functions that take inputs and return outputs without side effects. This enables comprehensive testing and predictable behavior.

### Adapter Registry Pattern

Adapters are registered in a Map, allowing easy extension for new AI tools without modifying core logic.

### Parallel Execution

Projects are processed in parallel using Promise.all() for optimal performance, while maintaining atomicity within each project.

### Security by Design

Path validation and normalization happen at the schema level, preventing malicious paths from entering the system.

## Critical Implementation Paths and Data Flows

### Configuration Loading:

1. Read JSON file from user-specified path
2. Parse and validate with Zod schema
3. Transform paths to absolute, normalized forms
4. Return strongly-typed Config object

### Rule Processing:

1. Glob patterns resolved to actual file paths
2. Invalid files filtered out (size/extension checks)
3. File contents read asynchronously
4. Content passed to adapters with metadata

### Action Execution:

1. Adapters generate FSAction arrays with raw paths
2. All paths normalized once in executeActions
3. Actions grouped by target directory
4. Dependencies resolved (parent dirs first)
5. Groups sorted lexicographically
6. Actions within groups prioritized (mkdir → copy → write)
7. Sequential execution with fail-fast on errors

## High-Level Source Code Structure

```
sync-rules/
├── src/
│   ├── cli.ts              # Main entry point and orchestration
│   ├── config.ts           # Configuration schemas and parsing
│   ├── constants.ts        # Shared constants and paths
│   ├── execution.ts        # Filesystem operation executor
│   ├── filesystem.ts       # File I/O operations
│   ├── globLogic.ts        # Pattern processing logic
│   ├── pathGuard.ts        # Path validation and security
│   ├── reporting.ts        # Report formatting and output
│   ├── utils.ts            # Utility functions
│   └── adapters/
│       ├── index.ts        # Adapter registry
│       ├── claude.ts       # Claude adapter
│       ├── gemini.ts       # Gemini adapter
│       └── kilocode.ts     # Kilocode adapter
├── tests/                  # Comprehensive test suite
├── bin/
│   └── sync-rules.ts       # Executable entry point
└── package.json           # Node.js configuration
```

## Module Integration

### Type System Integration

- Discriminated unions for FSAction ensure type safety
- Zod schemas define both runtime validation and TypeScript types
- Same-name pattern for schemas and types (e.g., Config schema and Config type)

### Error Handling Strategy

- Modules throw native errors (e.g., ZodError)
- CLI layer catches and formats for user presentation
- Exit codes: 0 for success, 1 for any failure

### Testing Architecture

- 100% code coverage across 201 tests
- Unit tests for pure functions
- Integration tests for I/O operations
- Proper mocking with vi.hoisted() for ESM modules
- Dedicated test suites for reporting module and PathGuard utility

## Key Implementation Insights

### Performance Optimizations:

- Parallel project processing reduces total execution time
- File operations grouped by directory to minimize syscalls
- Native fs.glob API avoids external dependency overhead

### Security Considerations:

- Path traversal prevention centralized in PathGuard utility
- Single validatePath call per action ensures consistency
- Allowed directory restrictions for project paths with dynamic management
- Symlink resolution prevents escape attempts
- No arbitrary code execution or dynamic requires

### Development Experience:

- TDD approach ensured robust implementation
- Pure functions simplify testing and debugging
- Clear error messages guide users to solutions
