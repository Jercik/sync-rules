# Technical Context: sync-rules

## Runtime Requirements

### Node.js 23.6+

- **Native TypeScript Execution**: Runs `.ts` files directly without compilation
- **ES Modules**: Full support for modern JavaScript module system
- **Built-in APIs**: Leverages native `crypto`, `fs/promises`, `os`, `path` modules

## Dependencies

### Core Dependencies (3 total)

- **commander**: CLI argument parsing and help generation (v14.0.0)
- **fast-glob**: Efficient file pattern matching with glob support (v3.3.3)
  - Configured with .md constraint for consistent file filtering
  - Used in both scanning and discovery phases
- **zod**: Runtime type validation and schema parsing (v4.0.5)
  - Used for manifest file validation (manifest.json and manifest.local.json)
  - Ensures type-safe parsing of conditional rule configurations
  - Provides detailed error messages for invalid manifest schemas

### Node.js Built-ins

- **crypto**: SHA-256 hash generation for reliable file comparison
- **fs/promises**: Async file system operations (copyFile, stat, readFile, etc.)
- **os**: Temporary directory access and platform detection
- **path**: Cross-platform path manipulation and normalization

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

- **No Compilation**: TypeScript files run directly via Node.js 23.6+
- **Type Checking**: `npm run typecheck` runs `tsc --noEmit` for validation
- **Testing**: Vitest for unit and integration tests (193 tests total)
- **Formatting**: Prettier for consistent code style
- **Zero Build Step**: Eliminates transpilation complexity

### External Process Integration

- **Error Handling**: Distinguish between command failures and expected non-zero exits

## Platform Considerations

### Cross-Platform Compatibility

- **Path Normalization**: Consistent forward-slash paths across platforms
- **Temporary Files**: OS-appropriate temporary directory usage
- **Command Execution**: Platform-agnostic external command handling

## Performance Characteristics

- **Serial Processing**: Sequential file hashing for reliability and simplicity
- **Parallel Scanning**: Multiple projects scanned concurrently
- **Memory Usage**: Files larger than 1MB are automatically skipped
- **I/O Efficiency**: Minimal file reads, efficient glob patterns, .md constraint reduces file system overhead
- **Smart Caching**: File hashes cached during single run for comparison

## Testing Infrastructure

### Test Coverage
- **193 total tests** all passing across unit and integration suites
- **Unit tests**: Utils, scanning, discovery, generation, multi-sync, path security
- **Integration tests**: CLI options, sync scenarios, edge cases, error handling, CLAUDE.md generation, path security
- **Test helpers**: CLI runner (with new interactive prompt support), file system utilities, scenario fixtures
- **Coverage**: All major code paths, edge cases, and security boundaries

### Test Categories
- **CLI behavior**: Flag combinations, error handling, help/version
- **File operations**: Sync, copy, delete, hash calculation
- **.md constraint**: Non-.md file ignorance, pattern warnings
- **Interactive mode**: User prompts, decision handling
- **Auto-confirm**: Newest file selection, no-delete guarantee
- **Edge cases**: Large files, permissions, symlinks, special characters
- **CLAUDE.md generation**: 9 passing tests covering all interactive scenarios
  - Includes interactive prompt handling with new `runCLIInteractive` helper
  - Fixed bug where CLAUDE.md generation was skipped when no sync was needed
- **Path security**: 15 tests (9 unit + 6 integration) preventing path traversal attacks
  - Tests cover Unix/Windows paths, encoded attempts, complex traversals
  - Validates all user inputs stay within allowed directory boundaries

## Known Limitations

### Adoption Constraints

- **Node.js Version**: Requires 23.6+ for native TypeScript execution
- **Breaking Changes**: Global .md constraint requires existing users to rename rule files

### Operational Considerations

- **Version Compatibility**: Modern Node.js requirement may prevent usage in legacy environments
- **File Format Constraint**: Only .md files supported (by design for consistency)
