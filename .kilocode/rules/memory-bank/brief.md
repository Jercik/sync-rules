# Project Brief: sync-agent-rules

## Core Requirements

`sync-agent-rules` is a CLI tool that synchronizes AI coding assistant rule files between projects. The tool must be simple, reliable, and easy for developers to adopt.

## Primary Goals

1. **Automated Synchronization**: Copy and merge rule files between source and target directories
2. **Change Detection**: Use SHA-1 hashing to identify file differences efficiently
3. **Conflict Resolution**: Provide interactive merge capabilities when files differ
4. **Developer-Friendly**: Simple CLI interface with clear feedback and error messages
5. **Zero Configuration**: Work out-of-the-box with sensible defaults

## Scope

- Synchronize common AI assistant rule files (`.clinerules`, `.cursorrules`, `.kilocode`, etc.)
- Support custom rule patterns via CLI options
- Handle file conflicts through VS Code integration
- Provide dry-run mode for safe previewing
- Never delete files from target (preserve existing work)

## Success Criteria

- New users can sync rules in under 5 minutes
- Clear error messages guide users through common issues
- Reliable operation across different operating systems
- Minimal dependencies and fast execution
