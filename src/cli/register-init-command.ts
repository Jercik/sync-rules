import type { Command } from "@commander-js/extra-typings";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { createSampleConfig } from "../config/loader.js";

type ParentCommand = Command<[], { config: string; verbose?: true }>;

export function registerInitCommand(program: ParentCommand): void {
  program
    .command("init")
    .description("Initialize a new configuration file")
    .option("-f, --force", "overwrite existing config file", false)
    .addHelpText(
      "after",
      `
This command creates a sample configuration file with example settings.

Examples:
  sync-rules init                      # Create config at default location
  sync-rules init --config ./my.json   # Create config at custom path
  sync-rules init --force              # Overwrite existing config`,
    )
    .action(async (options) => {
      const parentOptions = program.opts();
      const configPath = parentOptions.config || DEFAULT_CONFIG_PATH;
      await createSampleConfig(configPath, options.force);
    });
}
