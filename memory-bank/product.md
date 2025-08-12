# Product: sync-rules

## Purpose and Problems Solved

sync-rules solves the challenge of maintaining consistent AI coding assistant rules across multiple projects. When working with AI tools like Claude Code, Gemini CLI, or Kilocode, each project needs customized rule files that define coding styles, best practices, and project-specific guidelines. Manual copying leads to drift, inconsistencies, and wasted time.

The tool provides automated one-way synchronization from a central repository to all your projects, ensuring consistency while maintaining simplicity and user control.

## High-Level User Stories

- As a developer with multiple projects, I want to maintain my AI coding rules in one place and sync them automatically to all my projects
- As a team lead, I want to ensure all team projects follow the same AI assistant guidelines without manual intervention
- As a security-conscious user, I want the tool to validate paths and prevent any malicious file operations
- As a cautious user, I want to preview changes before applying them with a dry-run mode

## Functional Requirements and Behaviors

### Core Functionality

- Reads configuration from `~/.config/sync-rules-config.json`
- Sources rules from central repository at `~/Developer/agent-rules/rules/`
- Supports glob patterns for flexible rule selection
- Transforms rules through adapters for different AI tools
- Executes filesystem operations with proper dependency resolution

### Supported Adapters

- **claude**: Concatenates rules into `CLAUDE.md` with section separators
- **cline**: Copies individual rule files to `.clinerules/` directory
- **gemini**: Concatenates rules into `GEMINI.md` with section separators
- **kilocode**: Copies individual rule files to `.kilocode/rules/` directory

### Command-Line Interface

- `-c, --config <path>`: Required path to configuration file
- `-d, --dry-run`: Preview changes without applying them
- `--verbose`: Show detailed operation logs
- `-v, --version`: Display version information

## Non-Technical Success Criteria

### Performance

- Sub-second execution for typical usage (10-20 rules, 3-5 projects)
- Parallel processing ensures scalability to 100+ projects
- Native APIs minimize overhead and dependencies

### Reliability

- Comprehensive automated test suite ensures robustness
- Graceful error handling with clear messages
- Atomic operations prevent partial updates
- Path validation prevents security vulnerabilities

### Usability

- Zero configuration to start - just create config file
- Clear, colorful output with progress indicators
- Helpful error messages guide troubleshooting
- Non-interactive design enables automation

## User Experience

### Getting Started

1. Install globally: `npm install -g sync-rules`
2. Create config at `~/.config/sync-rules-config.json`
3. Run: `sync-rules -c ~/.config/sync-rules-config.json`

### Output Format

```
📋 Sync Rules Report
===================

Project: /Users/alice/projects/my-app
✓ Success
  📝 Written: 2 files
  📁 Created: 1 directories

Project: /Users/alice/projects/another-app
✓ Success
  📋 Copied: 5 files
```

### Error Handling

- Clear error messages with actionable solutions
- Validation errors show exactly what's wrong in config
- File operation errors include paths and reasons
- Non-zero exit codes for scripting integration
