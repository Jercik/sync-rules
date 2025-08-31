# sync-rules

## Centralized AI Coding Rule Propagation

`sync-rules` is a command-line interface (CLI) tool designed to keep AI coding assistant rule files consistent across multiple development projects. It automates the one-way distribution of tailored guidelines (for tools like Claude Code, Gemini CLI, or Kilocode) from a single, centralized source of truth (default: `~/.sync-rules/rules`). This eliminates manual copying and ensures your project rules stay aligned with minimal effort, prioritizing safety and user control.

### Purpose

`sync-rules` solves the problem of maintaining consistent AI coding rules across diverse projects. Manual updates lead to inconsistencies and wasted time. This tool provides an automated, centralized solution, ensuring rules are always aligned with a single source.

### How it Works

The tool operates as a centralized propagator. You define rules in a central repository (default: `~/.sync-rules/rules/`). A user-maintained configuration file (default: `~/.sync-rules/config.json`) specifies which projects receive which rules and how they are adapted for different AI tools (e.g., `CLAUDE.md`, `GEMINI.md`, or materialized into `.kilocode/rules/`). The process is fully automated and non-interactive - when launching AI tools, rules are automatically synced if needed for configured projects, with the central repository always being the source of truth.

### Configuration

#### Configuration File Location

The configuration file location can be customized in multiple ways (in order of precedence):

1. **Command-line flag**: `-c /path/to/config.json`
2. **Environment variable**: `SYNC_RULES_CONFIG=/path/to/config.json`
3. **Config directory override**: `SYNC_RULES_CONFIG_DIR=/custom/dir` (config.json will be expected in this directory)
4. **XDG Base Directory** (Linux only): If `XDG_CONFIG_HOME` is set, uses `$XDG_CONFIG_HOME/sync-rules/config.json`
5. **Default location**: `~/.sync-rules/config.json`

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
  // Optional: Specify a custom path for the central rules directory
  // "rulesSource": "/custom/path/to/rules",
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

The central rules directory location can be customized in multiple ways (in order of precedence):

1. **Configuration file**: `"rulesSource"` field in your config.json
2. **Environment variable**: `SYNC_RULES_CENTRAL_REPO=/path/to/rules`
3. **Default location**: `~/.sync-rules/rules`

Place your markdown rule files in this directory, organized however you prefer. The tool will select files based on the glob patterns specified in each project's `rules` array.

### Installation

`sync-rules` is a zero-build Node.js tool.

1.  **Prerequisites**: Node.js >=23.6.0
2.  **Clone**: `git clone https://github.com/your-repo/sync-rules.git && cd sync-rules`
3.  **Install**: `npm install`
4.  **Link (optional)**: `npm link`
5.  **Initialize config**: `sync-rules init`

### Architecture Overview

- **Core**: Node.js CLI.
- **Key Components**: CLI, Config (Zod validation), Utils, Glob Logic, Adapters (modular registry), Filesystem facade.
- **Design Patterns**: Pure Functions, Facade, Registry.
- **Data Flow**: Config -> Rules -> Adapters -> Filesystem actions.

### Security and PathGuard

- **Normalization only**: `normalizePath` expands `~` and resolves to an absolute path. It does not enforce directory boundaries or permissions.
- **Validation at execution**: Path boundary checks are enforced by `PathGuard` inside the execution layer right before filesystem writes.
- **Initialization timing**: The active `PathGuard` initializes after the configuration is loaded (in `cli` and `launch` flows).
- **Allowed roots**: By default, `PathGuard` allows only the central rules repo (default: `~/.sync-rules/rules`) plus the explicit project paths from your config. The home directory and current working directory are not implicitly allowed.
- **Customizing roots**: To grant write access to additional locations, add those paths as projects in your config.
- **Rationale**: This design follows least privilege and avoids premature config rejection. You can define projects anywhere (e.g., other drives); enforcement happens only when performing filesystem operations.

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
sync-rules sync --verbose
sync-rules sync -c /path/to/config.json

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

# Force sync to ensure latest rules
sync-rules launch --force claude
sync-rules launch --force gemini -- -d  # with debug output

# Piping input to AI tools
cat error.log | sync-rules launch claude -- -p "What's causing this error?"
git diff | sync-rules launch gemini -- -p "Review these changes"
```

Features:

- Automatically detects project from current directory
- Verifies rules match expected state before launching
- Automatically syncs if rules are out-of-date (unless `--no-sync`)
- Force sync with `--force` flag
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

# Force sync for critical work
alias claude-sync='sync-rules launch --force claude --'
```

Example usage with aliases:

```bash
claudep "What does this function do?"
geminip "Add error handling to this code"
git diff | claude-json "Review these changes"
```

Now your tools will always check rules before starting!

### Legacy Usage

Older examples that explicitly specify the `sync` subcommand still work (note: `sync` is the default):

```bash
# Basic (uses default config at ~/.sync-rules/config.json)
sync-rules
## or
sync-rules sync

# With specific config
sync-rules sync -c /path/to/config.json

# Dry-run and verbose
sync-rules sync -d --verbose

# Show help
sync-rules --help
```

## Known Issues

### Deleted Rules Not Removed from Projects

When a rule file is deleted from the central repository (`~/.sync-rules/rules/`), the corresponding file in project directories is **not** automatically removed during sync. This is a known limitation of the current implementation.

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
- **Execution**: The executor validates paths via `PathGuard` and writes files using `fs-extra.outputFile`.
- **Report**: The execution report includes a `written` array and any errors encountered. There are no copy or mkdir actions.
