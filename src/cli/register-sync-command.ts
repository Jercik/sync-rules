import type { Command } from "@commander-js/extra-typings";
import { runSyncCommand } from "./run-sync-command.js";

type ParentCommand = Command<[], { config: string; verbose?: true }>;

export function registerSyncCommand(program: ParentCommand): void {
  program
    .command("sync", { isDefault: true })
    .description("Synchronize rules across all configured projects (default)")
    .option("-n, --dry-run", "preview changes without writing files")
    .option("--porcelain", "machine-readable output (implies --dry-run)")
    .addHelpText(
      "after",
      `
This is the default command when no subcommand is specified.

Examples:
  sync-rules                           # Sync all projects (silent on success)
  sync-rules --verbose                 # Sync with status output
  sync-rules --dry-run                 # Preview what would be written
  sync-rules --porcelain               # Machine-readable dry-run output
  sync-rules && claude --chat          # Chain with AI tool on success
  sync-rules --porcelain | wc -l       # Count files that would be written`,
    )
    .action(async (options) => {
      const parentOptions = program.opts();
      await runSyncCommand({
        configPath: parentOptions.config,
        verbose: parentOptions.verbose ?? false,
        dryRun: options.dryRun ?? options.porcelain ?? false,
        porcelain: options.porcelain ?? false,
      });
    });
}
