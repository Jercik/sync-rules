# sync-rules

A CLI tool to synchronize AI coding assistant rule files between a central repository and multiple projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this tool for?

Many AI coding assistants (Claude Code, Gemini, OpenCode, Codex CLI) read a local rules file to understand context, coding standards, and specific instructions.

Managing these rules across numerous projects can be tedious. `sync-rules` lets you maintain a **single, centralized directory** of rules and automatically synchronize the relevant subsets into your projects using a single standard file.

## Key Features

- **Centralized Rule Management:** Keep all your AI guidelines in one place.
- **Project-Specific Configuration:** Use flexible glob patterns to define exactly which rules apply to which projects.
- **Single Standard File:** Always generates `AGENTS.md` with all selected rules and writes a `CLAUDE.md` file containing `@AGENTS.md` for Claude Code.
  // Seamless integration via shell: chain with your tool, e.g. `sync-rules && claude --chat`.

## Installation

Requires Node.js v22.0.0 or higher.

```bash
npm install -g sync-rules
```

Or run without installing globally using npx:

```bash
npx sync-rules --help
# e.g.
npx sync-rules init
```

## Usage

The workflow involves initializing a configuration file, defining your projects and rules, and then running the synchronization.

### 1\. Initialize Configuration

First, initialize the configuration file:

```bash
sync-rules init
```

This creates a sample `config.json`. By default, it is stored in your system's application data directory. You can specify a custom path using the `--config <path>` flag or the `SYNC_RULES_CONFIG` environment variable.

### 2\. Configure Projects and Rules

Edit the `config.json` file to define your setup.

```json
{
  "rulesSource": "/path/to/my/central/rules/repository",
  "projects": [
    {
      "path": "~/Developer/my-backend-api",
      "rules": ["backend/**/*.md", "python-style.md", "!backend/legacy/**"]
    },
    {
      "path": "~/Developer/my-frontend-app",
      "rules": ["frontend/**/*.md"]
    }
  ]
}
```

- `rulesSource`: The central directory where you store your rule files (e.g., Markdown files). If omitted, it defaults to the system's data directory.
- `projects`: An array defining each project.
  - `path`: The root directory of the project (supports `~` for home directory).
  - `rules`: POSIX-style glob patterns to select files from `rulesSource`. Supports negation (`!`).

### 3\. Synchronize Rules

To synchronize the rules for all configured projects, run the default command:

```bash
sync-rules
# or
sync-rules sync
```

This reads the rules and writes `AGENTS.md` in each project. It also writes `CLAUDE.md` containing `@AGENTS.md` for Claude Code.

### 4\. Run With Your Tool

Use standard shell chaining so your tool runs only after a successful sync:

```bash
cd ~/Developer/my-backend-api
sync-rules && claude --chat
```

Tip: define a small shell function to forward args cleanly:

- bash/zsh: `sr() { sync-rules && command "$@"; }` → `sr claude --chat`
- fish: `function sr; sync-rules; and command $argv; end`

## Output Files

- `AGENTS.md`: Canonical rules file read by Codex CLI, Gemini, and OpenCode.
- `CLAUDE.md`: A tiny include file with `@AGENTS.md` (Claude Code supported syntax).

## License

MIT License (c) 2025 Łukasz Jerciński
