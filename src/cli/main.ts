import { Command, CommanderError } from "@commander-js/extra-typings";
import packageJson from "../../package.json" with { type: "json" };
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_RULES_SOURCE,
} from "../config/constants.js";
import { createSampleConfig } from "../config/loader.js";
import { ensureError } from "../utils/errors.js";
import type { RawCliInput } from "./resolve-cli-command.js";
import { resolveCliCommand } from "./resolve-cli-command.js";
import { printPaths, resolvePaths } from "./resolve-paths.js";
import { runSyncCommand } from "./run-sync-command.js";

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]): Promise<number> {
  const program = new Command<[], RawCliInput>()
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version)
    .helpCommand(false)
    .allowExcessArguments(false)
    .option(
      "-c, --config <path>",
      "path to configuration file",
      DEFAULT_CONFIG_PATH,
    )
    .option("--init", "create a sample configuration file")
    .option("-f, --force", "overwrite existing config file (with --init)")
    .option(
      "--paths",
      String.raw`print resolved config and rules source paths (TSV; parse with -F'\t')`,
    )
    .option("-n, --dry-run", "preview changes without writing files")
    .option("--porcelain", "machine-readable output (implies --dry-run)")
    .option("--json", "structured JSON output (implies --dry-run)")
    .option("-v, --verbose", "enable verbose output")
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError()
    .exitOverride()
    .configureHelp({
      sortOptions: true,
    });
  program.addHelpText(
    "after",
    String.raw`
Resolved defaults:
  CONFIG: ${DEFAULT_CONFIG_PATH}
  RULES_SOURCE: ${DEFAULT_RULES_SOURCE}

Examples:
  sync-rules                        # Sync all projects (default)
  sync-rules --init                 # Create a sample config file
  sync-rules --paths                # Print resolved config and rules paths
  sync-rules --paths | awk -F'\t' '/^RULES_SOURCE/ {print $2}'  # Extract rules path
  sync-rules --json | jq '.written[]'            # List files that would be written (JSON)
  sync-rules --porcelain | tail -n +2 | wc -l   # Count files that would be written`,
  );
  program.action(async (rawInput) => {
    const command = resolveCliCommand(rawInput);

    switch (command.kind) {
      case "init": {
        await createSampleConfig(command.configPath, command.force);
        return;
      }
      case "paths": {
        const resolved = await resolvePaths(command.configPath);
        printPaths(resolved);
        if (resolved.error) {
          throw resolved.error;
        }
        return;
      }
      case "sync": {
        await runSyncCommand(command.options);
        return;
      }
    }
  });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const error_ = ensureError(error);

    if (error_ instanceof CommanderError) {
      const exitCode =
        typeof error_.exitCode === "number" ? error_.exitCode : 1;
      if (exitCode !== 0) {
        console.error(error_.message);
      }
      return exitCode;
    }

    console.error(error_.message);
    return 1;
  }

  return 0;
}
