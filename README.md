# sync-rules

## Centralized AI Coding Rule Propagation

`sync-rules` is a command-line interface (CLI) tool designed to keep AI coding assistant rule files consistent across multiple development projects. It automates the one-way distribution of tailored guidelines (for tools like Claude Code, Gemini CLI, or Kilocode) from a single, centralized source of truth (`~/Developer/agent-rules`). This eliminates manual copying and ensures your project rules stay aligned with minimal effort, prioritizing safety and user control.

### Purpose

`sync-rules` solves the problem of maintaining consistent AI coding rules across diverse projects. Manual updates lead to inconsistencies and wasted time. This tool provides an automated, centralized solution, ensuring rules are always aligned with a single source.

### How it Works

The tool operates as a centralized propagator. You define rules in a central repository (`~/Developer/agent-rules/rules/`). A user-maintained configuration file (`~/.config/sync-rules/config.json`) specifies which projects receive which rules and how they are adapted for different AI tools (e.g., `CLAUDE.md`, `GEMINI.md`, or copied to `.kilocode/rules/`). The process is non-interactive, with the central repository always being the source of truth.

### Configuration

You run `sync-rules`, which reads a user-maintained configuration file at `~/.config/sync-rules/config.json`. This JSON file, validated via Zod against a schema (with a `$schema` reference for editor support), lists projects to sync, along with which rules to select (via glob patterns like `"python.md"` or `"frontend/**"`) and which adapters to apply (from a supported list: `claude`, `gemini`, `kilocode`). If a project isn't listed in the config, it's ignored—users must manually add entries to start syncing a repository, making the process deliberate and human-editable.

Here's an example config:

```json
{
  "$schema": "https://example.com/sync-rules.schema.json",
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

### Installation

`sync-rules` is a zero-build Node.js tool.

1.  **Prerequisites**: Node.js >=24.0.0
2.  **Clone**: `git clone https://github.com/your-repo/sync-rules.git && cd sync-rules`
3.  **Install**: `npm install`
4.  **Link (optional)**: `npm link`

### Architecture Overview

- **Core**: Node.js CLI.
- **Key Components**: CLI, Config (Zod validation), Utils, Glob Logic, Adapters (modular registry), Filesystem facade.
- **Design Patterns**: Pure Functions, Facade, Registry.
- **Data Flow**: Config -> Rules -> Adapters -> Filesystem actions.

### Usage

(This section will be expanded with concrete examples once the CLI is fully implemented.)

```bash
sync-rules --help
```

### Claude Memory Bank Alias (`claudemb`)

To streamline using Claude with the Memory Bank startup procedure, you can use the `claudemb` shell function. It's a wrapper around the `claude` CLI that automatically injects the global memory bank rule into the system prompt.

This ensures Claude always starts with the required instructions for re-establishing context, regardless of the project you're working on.

**Setup**

Add the following function to your shell's configuration file (e.g., `~/.bashrc` or `~/.zshrc`):

```bash
claudemb() {
  # Path to your central AI rules repository.
  # The '~' will be expanded by your shell to your home directory.
  local rules_file="~/Developer/agent-rules/rules/ai-coding-workflow/memory-bank.md"

  # Evaluate the path to handle the tilde expansion correctly.
  local expanded_rules_file
  eval expanded_rules_file="$rules_file"

  if [[ ! -f "$expanded_rules_file" ]]; then
    echo "Error: Memory Bank rule file not found at: $expanded_rules_file" >&2
    echo "Hint: Make sure your central 'agent-rules' repository is cloned at '~/Developer/agent-rules'." >&2
    return 1
  fi

  # Forwards all arguments to the claude command, appending the rules file content.
  claude --append-system-prompt "$(< "$expanded_rules_file")" "$@"
}
```

**Usage**

You can now use `claudemb` as a drop-in replacement for `claude`.
