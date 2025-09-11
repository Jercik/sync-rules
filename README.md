# sync-rules

A CLI tool to synchronize AI coding assistant rule files between a central repository and multiple projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this tool for?

Many AI coding assistants (like Claude, Gemini, etc.) can be customized using files stored within your project directory to understand context, coding standards, and specific instructions.

Managing these rules across numerous projects and different tools can become tedious. `sync-rules` solves this by allowing you to maintain a **single, centralized directory** of rules and automatically synchronize the relevant subsets into your various projects, formatted correctly for each tool.

## Key Features

- **Centralized Rule Management:** Keep all your AI guidelines in one place.
- **Project-Specific Configuration:** Use flexible glob patterns to define exactly which rules apply to which projects.
- **Adapter System:** Automatically formats rules for different AI tools (e.g., consolidating into `CLAUDE.md` or splitting into subdirectories).
- **Seamless Integration:** A `launch` command wrapper ensures your AI assistant always has the latest rules before it starts.

## Installation

Requires Node.js v22.0.0 or higher.

```bash
npm install -g sync-rules
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
      "adapters": ["claude", "kilocode"],
      "rules": [
        "backend/**/*.md",
        "python-style.md",
        "!backend/legacy/**"
      ]
    },
    {
      "path": "~/Developer/my-frontend-app",
      "adapters": ["gemini"],
      "rules": [
        "frontend/**/*.md"
      ]
    }
  ]
}
```

  - `rulesSource`: The central directory where you store your rule files (e.g., Markdown files). If omitted, it defaults to the system's data directory.
  - `projects`: An array defining each project.
      - `path`: The root directory of the project (supports `~` for home directory).
      - `adapters`: The AI tools you use in this project.
      - `rules`: POSIX-style glob patterns to select files from `rulesSource`. Supports negation (`!`).

### 3\. Synchronize Rules

To synchronize the rules for all configured projects, run the default command:

```bash
sync-rules
# or
sync-rules sync
```

This will read the rules and write the resulting files into the project directories (e.g., creating `CLAUDE.md` in `~/Developer/my-backend-api`).

### 4\. Automatic Syncing (Launch Wrapper)

A key feature is the `launch` command. It acts as a wrapper around your AI tools. When you launch a recognized tool via `sync-rules launch`, it first detects the current project, synchronizes the rules, and *then* starts the tool.

```bash
cd ~/Developer/my-backend-api

# Instead of running 'claude --chat'
sync-rules launch claude --chat
```

**How it works:**

1.  It detects the current working directory and finds the corresponding project configuration.
2.  It synchronizes the rules for that project.
3.  It launches the specified tool (`claude`), passing through any arguments (`--chat`).

This guarantees the AI assistant always has the most up-to-date instructions. You can set up shell aliases for a seamless experience:

```bash
alias claude='sync-rules launch claude'
```

## Supported Adapters

The tool includes built-in support for the following adapters:

| Adapter    | Type          | Output Location        | Description                                     |
|------------|---------------|------------------------|-------------------------------------------------|
| `claude`   | `single-file` | `CLAUDE.md`            | Consolidates all rules into a single file.      |
| `gemini`   | `single-file` | `GEMINI.md`            | Consolidates all rules into a single file.      |
| `codex`    | `single-file` | `AGENTS.md`            | Consolidates all rules into a single file.      |
| `kilocode` | `multi-file`  | `.kilocode/rules/`     | Copies rules individually into the directory.   |
| `cline`    | `multi-file`  | `.clinerules/`         | Copies rules individually into the directory.   |

## License

MIT License (c) 2025 Łukasz Jerciński
