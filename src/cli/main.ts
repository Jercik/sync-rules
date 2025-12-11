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

  // Register subcommands
  registerInitCommand(program);
  registerSyncCommand(program);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = ensureError(error);

    // Always print an error message to avoid silent failures.
    // Commander may also print its own message; duplication is acceptable.
    console.error(err.message);

    if (err instanceof CommanderError) {
      return typeof err.exitCode === "number" ? err.exitCode : 1;
    }

    return 1;
  }

  return 0;
}
