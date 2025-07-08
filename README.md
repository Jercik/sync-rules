# sync-rules CLI

A utility to synchronize AI coding assistant rule files seamlessly between projects.

## Features

- **Automated Synchronization:** Quickly synchronize rule files across projects.
- **Conflict Detection:** Uses SHA-1 hashes to detect differences and automatically opens VS Code for easy manual conflict resolution.
- **Flexible Patterns:** Customize rule directories and exclude patterns.
- **Safe Operation:** Never deletes existing files; only adds or updates.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- **Node.js**: v23.6 or later (required for native TypeScript execution)
- **Git**: v2.37 or later
- **VS Code**: For manual conflict resolution UI

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

Synchronize rules from one project to another:

```bash
sync-rules ./project-a ./project-b
```

### Dry Run

Preview changes without modifying files:

```bash
sync-rules ./project-a ./project-b --dry
```

### Verbose Output

See detailed output of synchronization operations:

```bash
sync-rules ./project-a ./project-b --verbose
```

### Custom Rule Directories

Specify custom rule directories or patterns:

```bash
sync-rules ./src ./dst --rulesDir .myRules .customRules "config/*.json"
```

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

## How It Works

The tool performs the following actions:

1. **Prepares Destination:** Creates the destination directory if it does not already exist.
2. **Scans:** Locates rule files in both source and destination directories.
3. **Compares:** Checks files using SHA-1 hashes to identify differences.
4. **Copies:** Automatically copies new or updated files to the destination.
5. **Conflict Resolution:** Opens conflicting files in VS Code for manual resolution.
6. **Preserves Data:** Does not delete target files not present in the source.

## Default Patterns

### Included Rule Patterns

By default, these rule files are included:

- `.clinerules`
- `.cursorrules`
- `.kilocode` (matches a file or directory named `.kilocode`. If it's a directory, all nested files and folders are included recursively)

### Excluded Patterns

These directories are excluded from synchronization by default:

- `memory-bank`
- `node_modules`
- `.git`

## Exit Codes

- **`0`** - Success; all files synchronized without issues.
- **`1`** - Success with conflicts; manual resolution required.
- **`2`** - Error encountered; synchronization unsuccessful.

## Contributing

Contributions are welcome! Please feel free to open an issue to discuss a bug or feature, or submit a pull request with your improvements.

## License

MIT © Łukasz Jerciński
