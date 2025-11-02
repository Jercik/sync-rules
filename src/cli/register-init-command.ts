import type { Command } from "commander";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { createSampleConfig } from "../config/loader.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new configuration file")
    .option("-f, --force", "Overwrite existing config file", false)
    .addHelpText(
      "after",
      "\nThis command creates a sample configuration file with example settings.",
    )
    .action(async (options: { force?: boolean }) => {
      const parentOpts = program.opts<{ config?: string }>();
      const configPath = parentOpts.config || DEFAULT_CONFIG_PATH;
      await createSampleConfig(configPath, options.force ?? false);
    });
}
