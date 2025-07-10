# sync-rules CLI

A utility to synchronize AI coding assistant rule files seamlessly between projects.

## Features

- **Automated Synchronization:** Quickly synchronize rule files across projects.
- **Conflict Detection:** Uses SHA-1 hashes to detect differences. In interactive mode, it prompts the user to choose the definitive version of a file.
- **Flexible Patterns:** Customize rule directories and exclude patterns.
- **Safe Operation:** Never deletes files without explicit user confirmation; supports optional deletion from all projects.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- **Node.js**: v23.6 or later (required for native TypeScript execution)
- **Git**: v2.37 or later

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

### Custom Rule Directories

Specify custom rule directories or patterns:

```bash
sync-rules ./src ./dst --rules .myRules .customRules "config/*.json"
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
.kilocode/config.local.json        # Local configuration
.cursorrules.local                 # Local cursor rules file
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
3. **Compares:** Checks files using SHA-1 hashes to identify differences.
4. **Interactive Decision Making:** For each file difference, prompts the user to choose:
   - Which version to use as the source of truth (overwrites others)
   - Whether to copy a file to missing projects
   - Whether to delete a file from all projects
5. **Executes Plan:** Performs the approved file operations (copy, update, delete).
6. **Safe Operation:** Only performs destructive operations (like deletion) when explicitly confirmed by the user.

## Default Patterns

### Included Rule Patterns

By default, these rule files are included:

- `.clinerules`
- `.cursorrules`
- `.kilocode` (matches a file or directory named `.kilocode`. If it's a directory, all nested files and folders are included recursively)

### Excluded Patterns

These patterns are excluded from synchronization by default:

- `memory-bank`
- `node_modules`
- `.git`
- `.DS_Store`

## Exit Codes

- **`0`** - Success; all files synchronized without issues.
- **`1`** - Success, but with issues (e.g., file access errors during sync).
- **`2`** - Error encountered; synchronization unsuccessful.

## Contributing

Contributions are welcome! Please feel free to open an issue to discuss a bug or feature, or submit a pull request with your improvements.

## License

MIT © Łukasz Jerciński
