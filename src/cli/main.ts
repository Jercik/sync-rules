import { Command, CommanderError } from "@commander-js/extra-typings";
import packageJson from "../../package.json" with { type: "json" };
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { ensureError } from "../utils/errors.js";
import { registerInitCommand } from "./register-init-command.js";
import { registerSyncCommand } from "./register-sync-command.js";

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]): Promise<number> {
  const program = new Command()
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version)
    .helpCommand(false)
    .enablePositionalOptions()
    .option(
      "-c, --config <path>",
      "path to configuration file",
      DEFAULT_CONFIG_PATH,
    )
    .option("-v, --verbose", "enable verbose output")
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError()
    .exitOverride()
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
      showGlobalOptions: true,
    });
  program.addHelpText(
    "after",
    `
Examples:
  sync-rules                        # Sync all projects (default)
  sync-rules init                   # Create a sample config file
  sync-rules --porcelain | tail -n +2 | wc -l   # Count files that would be written`,
  );

  // Register subcommands
  registerInitCommand(program);
  registerSyncCommand(program);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = ensureError(error);

    if (err instanceof CommanderError) {
      if (typeof err.exitCode === "number" && err.exitCode !== 0) {
        console.error(err.message);
      }
      return typeof err.exitCode === "number" ? err.exitCode : 1;
    }

    console.error(err.message);
    return 1;
  }

  return 0;
}
