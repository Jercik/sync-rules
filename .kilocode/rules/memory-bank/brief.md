# Project Brief: sync-rules

## Core Requirements

`sync-rules` is a CLI tool that synchronizes AI coding assistant rule files between projects. The tool must be simple, reliable, and easy for developers to adopt.

## Primary Goals

1. **Automated Synchronization**: Synchronize rule files between multiple projects by establishing a single source of truth for each file.
2. **Change Detection**: Use SHA-256 hashing to identify file differences efficiently.
3. **Conflict Resolution**: When files differ, interactively prompt the user to choose which version should be used to overwrite the others.
4. **Developer-Friendly**: Simple CLI interface with clear feedback and error messages
5. **Zero Configuration**: Work out-of-the-box with sensible defaults

## Scope

- Synchronize common AI assistant rule files (`.clinerules`, `.cursorrules`, `.kilocode`, etc.)
- Support custom rule patterns via CLI options
- Handle file differences through an interactive CLI prompt.
- Provide dry-run mode for safe previewing.
- Never delete files unless explicitly instructed by the user.

## Success Criteria

- New users can sync rules in under 5 minutes
- Clear error messages guide users through common issues
- Reliable operation across different operating systems
- Minimal dependencies and fast execution
