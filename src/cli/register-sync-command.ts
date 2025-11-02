import type { Command } from "commander";
import { runSyncCommand } from "./run-sync-command.js";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync", { isDefault: true })
    .description("Synchronize rules across all configured projects (default)")
    .addHelpText(
      "after",
      "\nThis is the default command when no subcommand is specified.",
    )
    .action(async () => {
      await runSyncCommand(program);
    });
}
