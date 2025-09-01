# sync-rules

## Centralized AI Coding Rule Propagation

`sync-rules` is a command-line interface (CLI) tool designed to keep AI coding assistant rule files consistent across multiple development projects. It automates the one-way distribution of tailored guidelines (for tools like Claude Code, Gemini CLI, or Kilocode) from a single, centralized source of truth. This eliminates manual copying and ensures your project rules stay aligned with minimal effort, prioritizing safety and user control.

### Purpose

`sync-rules` solves the problem of maintaining consistent AI coding rules across diverse projects. Manual updates lead to inconsistencies and wasted time. This tool provides an automated, centralized solution, ensuring rules are always aligned with a single source.

### How it Works

The tool operates as a centralized propagator. You define rules in a central repository. A user-maintained configuration file specifies which projects receive which rules and how they are adapted for different AI tools (e.g., `CLAUDE.md`, `GEMINI.md`, or materialized into `.kilocode/rules/`). The process is fully automated and non-interactive - when launching AI tools, rules are automatically synced if needed for configured projects, with the central repository always being the source of truth.

### Configuration

#### Configuration File Location

The configuration file location can be customized in multiple ways (in order of precedence):

1. **Command-line flag**: `-c /path/to/config.json`
2. **Environment variable**: `SYNC_RULES_CONFIG=/path/to/config.json`
3. **Default location**: Platform-specific config directory (e.g., `~/.config/sync-rules/config.json` on Linux, `~/Library/Application Support/sync-rules/config.json` on macOS)

#### Getting Started

To create a sample configuration file:

```bash
sync-rules init
```

This will create a config file at the default location with example structure that you can customize.

#### Configuration Format

The configuration is a JSON file, validated via Zod, that lists projects to sync, along with which rules to select (via glob patterns like `"python.md"` or `"frontend/**"`) and which adapters to apply (from a supported list: `claude`, `cline`, `gemini`, `kilocode`). If a project isn't listed in the config, it's ignored—users must manually add entries to start syncing a repository, making the process deliberate and human-editable.

Here's an example config:

```json
{
  "projects": [
    {
      "path": "/home/alice/Work/awesome-service",
      "rules": ["python.md", "devops/ansible.md"],
      "adapters": ["claude", "kilocode"]
    },
    {
      "path": "/home/alice/Work/website-frontend",
      "rules": ["frontend/**"],
      "adapters": ["gemini"]
    }
  ]
}
```

#### Rules Source Location

The central rules directory defaults to a platform-specific data directory (via [env-paths](https://npmjs.com/package/env-paths)). You can optionally override this location by adding a `"rulesSource"` field to your configuration:

```json
{
  "rulesSource": "/custom/path/to/rules",
  "projects": [...]
}
```

**Default locations by platform:**

- **Linux**: `~/.local/share/sync-rules/rules`
- **macOS**: `~/Library/Application Support/sync-rules/rules`
- **Windows**: `%APPDATA%/sync-rules/rules`

Place your markdown rule files in this directory, organized however you prefer. The tool will select files based on the glob patterns specified in each project's `rules` array.

**Glob patterns use POSIX-style paths** (forward slashes) even on Windows:

```json
"rules": [
  "frontend/**/*.md",     // All .md files under frontend/
  "backend/api.md",       // Specific file
  "shared/**",            // Everything under shared/
  "!**/test/**"           // Exclude test directories
]
```

### Installation

#### Install from npm (recommended)

```bash
npm install -g sync-rules
sync-rules init
```

#### Install from source

1.  **Prerequisites**: Node.js >=20.0.0
2.  **Clone**: `git clone https://github.com/your-repo/sync-rules.git && cd sync-rules`
3.  **Install**: `npm install`
4.  **Build**: `npm run build`
5.  **Link (optional)**: `npm link`
6.  **Initialize config**: `sync-rules init`

### Architecture Overview

- **Core**: Node.js CLI.
- **Key Components**: CLI, Config (Zod validation), Utils, Glob Logic, Adapters (modular registry), Filesystem facade.
- **Design Patterns**: Pure Functions, Facade, Registry.
- **Data Flow**: Config -> Rules -> Adapters -> Filesystem actions.

#### Glob Logic

Rule selection uses glob patterns powered by the globby library with case-sensitive matching. Patterns must match file extensions exactly (e.g., `**/*.md` will not match `.MD` files).

**Important Notes:**

- Empty `rules` array or only negative patterns (e.g., `["!test/**"]`) will select no files
- To exclude certain files while selecting others, be explicit: `["**/*.md", "!test/**"]`
- At least one positive pattern is required to select any files

### Security

- **Path validation**: Path boundary checks are enforced directly in the adapter planning phase using Node.js's [`path.resolve`](https://nodejs.org/api/path.html#pathresolvepaths) and [`path.relative`](https://nodejs.org/api/path.html#pathrelativefrom-to) to prevent any path traversal attempts before execution.
- **Adapter-level enforcement**: Each adapter validates that generated file paths stay within their designated directories (e.g., multi-file adapters ensure rules remain within `.kilocode/rules/` or `.clinerules/`).
- **No global policy**: Security is enforced at the source where paths are generated, not through a global validation layer.
- **Safe by construction**: Adapters use `path.resolve` and `path.relative` to detect and reject any paths that would escape their intended directories.
- **Rationale**: This design ensures safety at the earliest point (during planning) rather than at execution time, making path traversal attacks impossible by construction.

### Usage

## Commands

### Sync Command

Synchronize rules across all configured projects:

```bash
# Initialize configuration (first time only)
sync-rules init

# Sync rules (default)
sync-rules

# Or explicitly
sync-rules sync

# With options
sync-rules sync --dry-run
sync-rules sync -v
sync-rules sync --verbose
sync-rules sync -c /path/to/config.json

# Check version
sync-rules -V

# Using environment variable
SYNC_RULES_CONFIG=/path/to/config.json sync-rules sync
```

The `sync` subcommand is the default — running `sync-rules` without a subcommand performs a sync.

### Launch Command

The `launch` subcommand wraps AI coding tools to ensure rules are always up-to-date:

```bash
# Basic usage - interactive mode
sync-rules launch claude
sync-rules launch gemini

# Headless mode with prompts
sync-rules launch claude -- -p "How does the auth system work?"
sync-rules launch gemini -- -p "Generate unit tests for main.ts"

# With specific models
sync-rules launch gemini -- --model gemini-2.5-pro
sync-rules launch claude -- -p "Fix the bug in parser.js" --output-format json

# Skip sync check when you know rules are current
sync-rules launch --no-sync claude -- -p "Review this PR"
sync-rules launch --no-sync gemini -- --style dark


# Piping input to AI tools
cat error.log | sync-rules launch claude -- -p "What's causing this error?"
git diff | sync-rules launch gemini -- -p "Review these changes"
```

Features:

- Automatically detects project from current directory
- Verifies rules match expected state before launching
- Automatically syncs if rules are out-of-date (unless `--no-sync`)
- Exits with error if adapter not configured for project
- Passes through all arguments to the wrapped tool

### Shell Aliases

Add these to your shell config (~/.bashrc, ~/.zshrc, etc.):

```bash
# Basic aliases for interactive mode
alias claude='sync-rules launch claude'
alias gemini='sync-rules launch gemini'

# Headless mode aliases for quick prompts
alias claudep='sync-rules launch claude -- -p'
alias geminip='sync-rules launch gemini -- -p'

# With specific preferences
alias claude-json='sync-rules launch claude -- --output-format json -p'
alias gemini-pro='sync-rules launch gemini -- --model gemini-2.5-pro'

# Skip sync for faster launches when iterating
alias claude-fast='sync-rules launch --no-sync claude --'
alias gemini-fast='sync-rules launch --no-sync gemini --'

```

Example usage with aliases:

```bash
claudep "What does this function do?"
geminip "Add error handling to this code"
git diff | claude-json "Review these changes"
```

Now your tools will always check rules before starting!

### Logging

- Default level: `warn`.
- Verbose: `-v` sets level to `debug` and prints the log file path.
- CLI override: `--log-level <silent|error|warn|info|debug|trace>`.
- Env override: set `LOG_LEVEL=<level>`.
- Optional file logging: set `LOG_TO_FILE=1` (path is shown when running with `-v`).

## Known Issues

### Deleted Rules Not Removed from Projects

When a rule file is deleted from the central repository, the corresponding file in project directories is **not** automatically removed during sync. This is a known limitation of the current implementation.

**Impact:**

- Projects will show as "out of sync" with extra files
- The verification step identifies these files but cannot remove them
- For multi-file adapters (cline, kilocode), verification will flag these as "extra" files
- Manual intervention is required to clean up deleted rules

**Workaround:**
Manually delete the outdated rule files from your project directories when rules are removed from the central repository:

- For single-file adapters: Remove the specific file (e.g., `CLAUDE.md`, `GEMINI.md`)
- For multi-file adapters: Remove files from the rules directory (e.g., `.kilocode/rules/*.md`, `.clinerules/*.md`)

### Filesystem Actions & Reports

- **Actions**: Adapters generate a single action type: `write` with `path` and `content`. Parent directories are created automatically during execution.
- **Execution**: The executor creates parent directories as needed and writes files using Node's built-in [`fs/promises.writeFile`](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options) from the [`fs/promises`](https://nodejs.org/api/fs.html#promises-api) module.
- **Report**: The execution report includes a `written` array and any errors encountered. There are no copy or mkdir actions.
