# sync-rules CLI

A utility to synchronize AI coding assistant rule files seamlessly between projects.

## Features

- **Automated Synchronization:** Quickly synchronize rule files across projects.
- **Conflict Detection:** Uses SHA-256 hashes to detect differences. In interactive mode, it prompts the user to choose the definitive version of a file.
- **Flexible Patterns:** Customize rule directories and exclude patterns.
- **Safe Operation:** Never deletes files without explicit user confirmation; supports optional deletion from all projects.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- **Node.js**: v23.6 or later (required for native TypeScript execution)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Jercik/sync-rules.git
cd sync-rules
npm install
```

Link the package globally to use it from anywhere:

```bash
npm link
```

## Usage

### Basic Synchronization

Synchronize rules between multiple projects:

```bash
# Synchronize between two projects
sync-rules ./project-a ./project-b

# Synchronize between multiple projects
sync-rules ./project-a ./project-b ./project-c

# Auto-discover and sync all projects in ~/Developer
sync-rules
```

### Dry Run

Preview changes without modifying files:

```bash
sync-rules ./project-a ./project-b --dry-run
```

### Verbose Output

See detailed output of synchronization operations:

```bash
sync-rules ./project-a ./project-b --verbose
```

### Force Overwrite

Force overwrite existing files when adding (bypasses protection for race conditions):

```bash
sync-rules ./project-a ./project-b --force
```

⚠️ **Warning**: Use with caution. This option allows overwriting files that were created after the initial scan.

### Custom Rule Directories

Specify custom rule directories or patterns:

```bash
sync-rules ./src ./dst --rules .myRules.md .customRules.md "config/*.md"
```

### Non-Interactive Mode (Auto-Confirm)

Automatically synchronize using the newest file versions without prompts:

```bash
sync-rules ./project-a ./project-b --auto-confirm
```

This mode automatically selects the file with the most recent modification date as the source of truth and will never delete files.

### Excluding Specific Patterns

Prevent certain files or directories from being synchronized using the `--exclude` option. You can provide multiple patterns.

```bash
sync-rules ./project-a ./project-b --exclude "**/temp/*" "*.log" "config-local.json"
```

This example would exclude:

- Any files or folders within any directory named `temp`.
- Any files ending with `.log`.
- A specific file named `config-local.json` at the root of any matched rule directory.

See the "Default Patterns" section for patterns excluded by default.

### Project-Specific Rules (Local Files)

Files matching the `*.local.*` pattern are automatically recognized as project-specific and will not be synchronized. This allows you to maintain rules that should remain unique to each project.

```bash
# Example local files that won't be synced:
.clinerules/custom.local.md        # Project-specific markdown rules
.kilocode/config.local.md          # Local configuration
.cursorrules.local.md              # Local cursor rules file
```

Local files are:

- Automatically detected (no configuration needed)
- Preserved in both source and target directories
- Reported in the synchronization summary
- Never copied, merged, or deleted during sync

This is useful for:

- Environment-specific configurations
- Project-specific coding standards
- Temporary or experimental rules
- Client-specific customizations

### Conditional Rule Synchronization (Manifest-Based)

The conditional rule synchronization feature allows you to define when specific rules should be applied to projects based on their content. This is controlled through manifest files.

#### Manifest Files

- **`.kilocode/manifest.json`**: Central manifest that defines conditions for rule files. This file is synchronized across all projects.
- **`.kilocode/manifest.local.json`**: Local overrides specific to each project. This file is never synchronized.

#### Manifest Structure

```json
{
  "rules": {
    ".kilocode/ansible.md": {
      "condition": "**/*.yml"
    },
    ".kilocode/terraform.md": {
      "condition": "**/*.tf"
    },
    ".kilocode/python.md": {
      "condition": "**/*.{py,pyx,pyi}"
    }
  }
}
```

Each rule file can have a `condition` - a glob pattern that must match at least one file in the target project for the rule to be applied.

#### Local Overrides

Create a `.kilocode/manifest.local.json` to override manifest conditions for a specific project:

```json
{
  "include": [".kilocode/ansible.md"],  // Force include even if condition not met
  "exclude": [".kilocode/terraform.md"]  // Force exclude even if condition is met
}
```

#### How It Works

1. **Manifest Synchronization**: When manifests differ across projects, sync-rules first prompts you to choose which manifest version to use as the source of truth.
2. **Condition Evaluation**: During rule synchronization, each rule's condition is evaluated against the target project's files.
3. **Smart Filtering**: Rules are only added to projects where their conditions are met.
4. **Extraneous File Detection**: After sync, the tool identifies files that exist in projects but don't meet their conditions and offers to remove them.

#### Example Workflow

```bash
# Project A has ansible playbooks (.yml files)
# Project B is a Python project (no .yml files)
# Both have .kilocode/manifest.json with ansible rule condition "**/*.yml"

sync-rules ./project-a ./project-b

# Result: ansible.md will exist in Project A but not Project B
# because Project B doesn't meet the condition
```

This feature is completely optional - if no manifest exists, sync-rules behaves as before, syncing all rules to all projects.

### CLAUDE.md Generation

After a successful sync, the tool can automatically generate a `CLAUDE.md` file in each project by concatenating all rule files into a single Markdown document. This is useful for sharing or reviewing rules in one place.

- `--generate-claude` (default: true): Enable generation after sync
- `--no-generate-claude`: Skip generation

In interactive mode, you'll be prompted per project. Use `--auto-confirm` to generate without prompts. Generation respects `--dry-run` and skips if sync fails.

> **⚠️ Important**: CLAUDE.md is auto-generated and will be overwritten on each regeneration. Any manual edits to CLAUDE.md will be lost. Always edit the source rule files instead.

## Interactive Decision Making

When `sync-rules` detects file differences, it presents you with contextual options:

### For files that exist in only one project:

- **Copy to other projects**: Propagate the file to all missing projects
- **Delete from all projects**: Remove the file entirely from the sync set
- **Skip**: Leave the file as-is

### For files with different versions across projects:

- **Use newest version**: Select the most recently modified version as the source of truth
- **Use specific version**: Choose a particular project's version to propagate
- **Delete from all projects**: Remove the file entirely from all projects
- **Skip**: Leave all versions as-is

### For files missing from some projects:

- **Add to missing projects**: Copy the file to projects that don't have it
- **Delete from all projects**: Remove the file from projects that do have it
- **Skip**: Leave the current state unchanged

## How It Works

The tool performs the following actions:

1. **Validates Projects:** Ensures all specified project directories exist before proceeding.
2. **Scans:** Locates rule files in all specified project directories.
3. **Compares:** Checks files using SHA-256 hashes to identify differences.
4. **Interactive Decision Making:** For each file difference, prompts the user to choose:
   - Which version to use as the source of truth (overwrites others)
   - Whether to copy a file to missing projects
   - Whether to delete a file from all projects
5. **Executes Plan:** Performs the approved file operations (copy, update, delete).
6. **Safe Operation:** Only performs destructive operations (like deletion) when explicitly confirmed by the user.

## Default Patterns

### Included Rule Patterns

By default, these rule files are included:

- `.clinerules.md`
- `.cursorrules.md`
- `.kilocode` (directory - searches for all `.md` files recursively)

**Note:** The tool only processes `.md` files for consistency and to focus on Markdown-based rules.

### File Size Limits

Rule files larger than 1MB are automatically skipped. This ensures that:
- Rule files remain concise and readable
- Performance stays optimal
- Only actual rule files (not large data files) are synchronized

If a file exceeds 1MB, you'll see a warning message and the file will be excluded from synchronization.

### Excluded Patterns

These patterns are excluded from synchronization by default:

- `memory-bank`
- `node_modules`
- `.git`
- `CLAUDE.md` (auto-generated file)

## Exit Codes

- **`0`** - Success; all files synchronized without issues.
- **`1`** - Success, but with issues (e.g., file access errors during sync).
- **`2`** - Error encountered; synchronization unsuccessful.

## Contributing

Contributions are welcome! Please feel free to open an issue to discuss a bug or feature, or submit a pull request with your improvements.

## License

MIT © Łukasz Jerciński
