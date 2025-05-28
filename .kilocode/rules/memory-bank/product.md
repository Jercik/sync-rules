# Product Context: sync-agent-rules

## Problem Statement

Developers using AI coding assistants face a common challenge: keeping rule configurations synchronized across multiple projects. As teams refine their coding standards and AI assistant rules in one project, they need an efficient way to propagate these improvements to other projects.

## Current Pain Points

- **Manual Process**: Developers manually copy rule files between projects, which is time-consuming and error-prone
- **Inconsistency**: Different projects end up with different versions of rules, leading to inconsistent AI assistant behavior
- **Conflict Resolution**: When rules have been modified in both source and target projects, manual merging is complex and risky
- **Discovery**: Developers often forget which projects need rule updates or miss new rule files entirely

## Target Users

- **Individual Developers**: Working across multiple personal projects
- **Development Teams**: Maintaining consistent coding standards across team repositories
- **Open Source Maintainers**: Sharing best practices across related projects
- **Consultants/Freelancers**: Applying proven rule sets to new client projects

## Value Proposition

`sync-agent-rules` transforms rule synchronization from a manual, error-prone process into an automated, reliable workflow. Users can confidently propagate rule improvements across their entire project ecosystem with a single command.

## User Experience Vision

- **One Command**: `sync-rules source target` should handle 90% of use cases
- **Safe by Default**: Never lose work - preview changes and handle conflicts gracefully
- **Immediate Feedback**: Clear progress indicators and actionable error messages
- **Familiar Tools**: Leverage existing developer tools (Git, VS Code) for conflict resolution
