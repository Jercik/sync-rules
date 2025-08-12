# Brief: sync-rules

### How sync-rules Works: A Centralized Tool for Propagating AI Coding Rules to Projects

sync-rules is a command-line interface (CLI) tool designed to simplify the task of keeping AI coding assistant rule files consistent across multiple development projects by propagating them from a single, centralized source of truth. Imagine you're working on several repositories, each needing tailored guidelines for tools like Claude Code, Gemini CLI, or Kilocode—files that dictate coding styles, best practices, or custom configurations. Instead of manually copying and adapting rules, sync-rules automates one-way distribution from a hardcoded central repository (`~/Developer/agent-rules`), ensuring your rules stay aligned with minimal effort while prioritizing safety and user control.

At its core, the tool operates as a centralized propagator. The central repository (`~/Developer/agent-rules`) serves as the immutable source, with rules organized in a `rules` directory—either flat (e.g., `python.md`, `javascript.md`) or grouped by category (e.g., `devops/ansible.md`, `frontend/react.md`). You run a simple command like `sync-rules`, which reads a user-maintained configuration file at `~/.config/sync-rules-config.json`. This JSON file, validated via Zod, lists projects to sync, along with which rules to select (via glob patterns like `"python.md"` or `"frontend/**"`) and which adapters to apply (from a supported list: `claude`, `cline`, `gemini`, `kilocode`). If a project isn't listed in the config, it's ignored—users must manually add entries to start syncing a repository, making the process deliberate and human-editable. Here's an example config:

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

For each configured project, sync-rules globs the specified rules from the central repository, filters out any non-Markdown files or oversized ones (>1MB, though rule files are typically small), and applies the selected adapters. Adapters are built-in generators that transform the rules into the format expected by each tool:

- **Claude Code (`claude`)**: Concatenates selected rules into a single `CLAUDE.md` file, with minimal formatting like trimming whitespace and adding line breaks, relying on the rules' own headers for structure.
- **Cline (`cline`)**: Copies individual \*.md files to a `.clinerules/` directory within the project, preserving their structure and filenames.
- **Gemini CLI (`gemini`)**: Similarly concatenates into a single `GEMINI.md` file.
- **Kilocode (`kilocode`)**: Copies individual \*.md files to a `.kilocode/rules` directory within the project, preserving their structure and filenames.

This adapter system uses a modular registry pattern, making it easy to add support for new tools in future updates while keeping the tool lightweight. Note that generated files are auto-overwritten on each run—users should edit rules only in the central repository and propagate changes manually (sync-rules does not handle upstream updates from projects to the center).

The process is straightforward and non-interactive: no comparisons, conflict resolutions, or prompts, as the central repo is always the source of truth. Operations are executed in parallel where possible for efficiency, with atomic writes to avoid partial failures. A `--dry-run` flag lets you preview changes without modifying files, while `--verbose` provides detailed logging. The tool skips any local patterns like `*.local.*` in targets to avoid overwriting project-specific files and handles errors gracefully, such as permission issues or missing central repo, with informative messages.

Under the hood, sync-rules emphasizes security and reliability: paths are normalized and validated to prevent traversal attacks, Zod ensures config integrity, and a comprehensive automated test suite ensures robustness. It's a lightweight, zero-build Node.js tool that transforms rule management from manual copying into a single, confident command. Whether you're an individual developer or a team, sync-rules keeps your AI assistants aligned by centrally distributing adapted rules, so you can focus on coding.
