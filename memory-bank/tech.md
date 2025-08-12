# Tech: sync-rules

## Technologies, Libraries, and Dependencies

### Runtime Dependencies (Minimal)

- **Node.js >=24.0.0**: Native TypeScript execution without transpilation
- **Commander.js v14.0.0**: Battle-tested CLI framework
- **Zod v4.0.5**: TypeScript-first schema validation

### Development Dependencies

- **TypeScript v5.8.3**: Type checking only (not for transpilation)
- **Vitest v3.2.4**: Modern test runner with built-in coverage
- **ESLint v9.31.0**: Code quality enforcement
- **Prettier v3.6.2**: Code formatting
- **@types/node v24.0.15**: Node.js type definitions

## Development Environment Setup and Tooling

### Project Configuration

- **Module System**: ESM-only with `"type": "module"`
- **TypeScript**: `tsconfig.json` with `noEmit: true` and `lib: ["esnext"]`
- **Node.js**: Direct `.ts` file execution (no build step)
- **Entry Point**: `bin/sync-rules.ts` configured in package.json

### Available Scripts

- `npm start`: Run the CLI directly
- `npm test`: Run all tests once
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage report
- `npm run typecheck`: Type-check without emitting
- `npm run format`: Format code with Prettier
- `npm run lint`: Lint code with ESLint

### Testing Infrastructure

- **Framework**: Vitest with @vitest/coverage-v8
- **Coverage**: Comprehensive across modules
- **Structure**: One test file per module (`*.test.ts`)
- **Approach**: Test-Driven Development (TDD)

## Technical Constraints and Environment Specifics

### Platform Requirements

- **Node.js**: Version 24.0.0 or higher (for native TypeScript and fs.glob)
- **Operating System**: Platform-agnostic (tested on macOS/Linux)
- **File System**: Standard POSIX-compliant filesystem

### Design Constraints

- **No Build Step**: Direct TypeScript execution
- **No External Services**: Purely local filesystem operations
- **File Size Limit**: 1MB maximum for markdown files
- **Path Security**: Strict validation prevents directory traversal
- **Import Extensions**: Must use `.ts` extensions in imports

### Performance Characteristics

- **Parallel Processing**: Multiple projects processed concurrently
- **Native APIs**: Uses Node.js built-in fs.glob for efficiency
- **Memory Efficient**: Streams large files when possible
- **Fast Startup**: No compilation or bundling overhead

## Integration Details

### Filesystem Integration

- **Central Repository**: Hardcoded at `~/Developer/agent-rules`
- **Config Location**: User config at `~/.config/sync-rules-config.json`
- **Target Projects**: Any accessible directory on the filesystem

### No External Dependencies

- No network requests
- No database connections
- No third-party APIs
- Pure local operations only

## Testing Insights

### Mocking Strategies

- **ESM Modules**: Use `vi.hoisted()` for module mocks
- **Path Security**: Mock `normalizePath` in tests to allow test paths
- **Commander.js**: Mock `process.stderr.write` for CLI output testing
- **Filesystem**: Use temporary directories for integration tests

### Test Organization

- **Unit Tests**: Pure functions tested in isolation
- **Integration Tests**: Full workflow tests with real files
- **Coverage**: Broad coverage through TDD approach
- **Fast Execution**: ~400ms for entire test suite
- **Test Files**: 14 test files covering all modules (including PathGuard)
