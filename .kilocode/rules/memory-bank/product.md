# Product Context: sync-rules

## Problem Statement

Developers using AI coding assistants face a common challenge: keeping rule configurations synchronized across multiple projects. As teams refine their coding standards and AI assistant rules in one project, they need an efficient way to propagate these improvements to other projects.

## Current Pain Points

- **Manual Process**: Developers manually copy rule files between projects, which is time-consuming and error-prone
- **Inconsistency**: Different projects end up with different versions of rules, leading to inconsistent AI assistant behavior
- **Conflict Resolution**: When rules have been modified in both source and target projects, manual merging is complex and risky
- **Discovery**: Developers often forget which projects need rule updates or miss new rule files entirely
- **System File Pollution**: System files like `.DS_Store` could interfere with rule synchronization (resolved via global .md constraint)

## Target Users

- **Individual Developers**: Working across multiple personal projects
- **Development Teams**: Maintaining consistent coding standards across team repositories
- **Open Source Maintainers**: Sharing best practices across related projects
- **Consultants/Freelancers**: Applying proven rule sets to new client projects

## Value Proposition

`sync-rules` transforms rule synchronization from a manual, error-prone process into an automated, reliable workflow. Users can confidently propagate rule improvements across their entire project ecosystem with a single command.

### Key Features

- **Markdown-Only Processing**: Global .md constraint ensures clean, consistent rule handling
- **CLAUDE.md Generation**: Automatically generates consolidated rule files for Claude Code (auto-generated, manual edits will be lost)
- **Interactive Decision Making**: Smart prompts for conflict resolution with multiple options
- **Auto-Confirm Mode**: Deterministic newest-file selection for automated workflows
- **Local File Support**: Project-specific *.local.* files are automatically excluded from sync
- **Per-Project Rule Control**: Simple manifest.txt files allow each project to specify which rules it wants to include
- **Comprehensive Testing**: 193 tests covering all scenarios, edge cases, and security
- **Security Hardened**: Path traversal protection prevents unauthorized file access

## User Experience Vision

- **One Command**: `sync-rules [projects...]` handles 90% of use cases with smart defaults
- **Safe by Default**: Never lose work. Preview changes and handle conflicts gracefully through interactive prompts, or use the deterministic `--auto-confirm` flag to automatically sync to the newest version of a file. Auto-confirm never deletes files.
- **Immediate Feedback**: Clear progress indicators, actionable error messages, and warnings for non-.md patterns
- **Familiar Tools**: Leverages the command line for all interactions with comprehensive help
- **CLAUDE.md Integration**: Seamless generation of consolidated rule files for Claude Code after sync (overwrites existing CLAUDE.md)
