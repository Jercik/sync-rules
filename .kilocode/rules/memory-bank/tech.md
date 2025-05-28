# Technical Context: sync-agent-rules

## Runtime Requirements

### Node.js 23.6+

- **Native TypeScript Execution**: Runs `.ts` files directly without compilation
- **ES Modules**: Full support for modern JavaScript module system
- **Built-in APIs**: Leverages native `crypto`, `fs/promises`, `os`, `path` modules

### Git 2.37+

- **Merge Operations**: Required for `git merge-file` conflict resolution
- **System PATH**: Must be accessible from command line

### VS Code

- **Conflict Resolution**: Primary tool for interactive merge operations
- **CLI Access**: Requires `code` command available in PATH

## Dependencies

### Core Dependencies (3 total)

- **commander**: CLI argument parsing and help generation
- **execa**: Robust external process execution with better error handling
- **fast-glob**: Efficient file pattern matching with glob support

### Node.js Built-ins

- **crypto**: SHA-1 hash generation for file comparison
- **fs/promises**: Async file system operations
- **os**: Temporary directory access
- **path**: Cross-platform path manipulation

## TypeScript Configuration

### Key `tsconfig.json` Settings

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "strict": true,
    "target": "es2022",
    "verbatimModuleSyntax": true
  }
}
```

### Import Requirements

- **Explicit Extensions**: All imports must use `.ts` extensions
- **Type Imports**: Use `import type` for type-only imports
- **ES Modules**: Package.json must have `"type": "module"`

## Development Workflow

### Build Process

- **No Compilation**: TypeScript files run directly via Node.js
- **Type Checking**: `npm run typecheck` runs `tsc --noEmit` for validation
- **Zero Build Step**: Eliminates transpilation complexity

### External Process Integration

- **Error Handling**: Distinguish between command failures and expected non-zero exits
- **Exit Codes**: Proper handling of Git command exit codes (0=success, 1=conflicts, >1=error)
- **Process Isolation**: Use `execa` for better error handling than native `child_process`

## Platform Considerations

### Cross-Platform Compatibility

- **Path Normalization**: Consistent forward-slash paths across platforms
- **Temporary Files**: OS-appropriate temporary directory usage
- **Command Execution**: Platform-agnostic external command handling

## Performance Characteristics

- **Serial Processing**: Simple sequential file hashing for reliability
- **Memory Usage**: File size warnings for large files (>100MB)
- **I/O Efficiency**: Minimal file reads and efficient glob patterns

## Known Limitations

### Adoption Constraints

- **Node.js Version**: Requires 23.6+ which may limit adoption in environments with older Node.js versions
- **VS Code Dependency**: Conflict resolution requires VS Code CLI (`code` command) available in PATH
- **Git Dependency**: Merge operations require Git installation and accessibility from command line

### Operational Considerations

- **Version Compatibility**: The Node.js 23.6+ requirement may prevent usage in legacy environments
- **Tool Dependencies**: Both VS Code and Git must be properly installed and configured for full functionality
- **Platform Limitations**: While cross-platform compatible, external tool dependencies may vary by platform
