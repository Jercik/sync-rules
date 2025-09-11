import { Command, CommanderError } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { loadConfig, createSampleConfig } from "../config/loader.js";
import type { Project } from "../config/config.js";
import { SpawnError, SyncError, ensureError } from "../utils/errors.js";

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]): Promise<number> {
  const program = new Command();

  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version)
    .enablePositionalOptions()
    .option(
      "-c, --config <path>",
      "Path to configuration file",
      DEFAULT_CONFIG_PATH,
    )
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError()
    .exitOverride()
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
      showGlobalOptions: true,
    });

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
      // Pass force flag to createSampleConfig to handle file existence atomically
      await createSampleConfig(configPath, options.force ?? false);
    });

  program
    .command("sync", { isDefault: true })
    .description("Synchronize rules across all configured projects (default)")
    .addHelpText(
      "after",
      "\nThis is the default command when no subcommand is specified.",
    )
    .action(async () => {
      const options = program.opts<{ config?: string }>();
      const config = await loadConfig(options.config || DEFAULT_CONFIG_PATH);

      const settlements = await Promise.allSettled(
        config.projects.map(async (project: Project) => {
          const { syncProject } = await import("../core/sync.js");
          return await syncProject(project, { dryRun: false }, config);
        }),
      );

      // Collect and report failures with detailed context
      const failures: Array<{ project: Project; error: Error }> = [];

      settlements.forEach((settlement, index) => {
        if (settlement.status === "rejected") {
          const project = config.projects[index];
          if (project) {
            failures.push({
              project,
              error: ensureError(settlement.reason),
            });
          }
        }
      });

      if (failures.length > 0) {
        // Build detailed error message with all failure contexts
        const errorMessages = failures.map(({ project, error }) => {
          let message = `  • Project: ${project.path}`;

          // Extract SyncError details if available
          if (error instanceof SyncError) {
            if (error.details.adapter) {
              message += `\n    Adapter: ${error.details.adapter}`;
            }
            message += `\n    Error: ${error.message}`;
            if (error.cause) {
              const causeMessage =
                error.cause instanceof Error
                  ? error.cause.message
                  : JSON.stringify(error.cause);
              message += `\n    Cause: ${causeMessage}`;
            }
          } else {
            message += `\n    Error: ${error.message}`;
          }

          return message;
        });

        const summary =
          failures.length === 1
            ? "Synchronization failed for 1 project:"
            : `Synchronization failed for ${String(failures.length)} projects:`;

        throw new Error(`${summary}\n${errorMessages.join("\n")}`);
      }
    });

  program
    .command("launch <tool> [toolArgs...]")
    .description("Launch an AI tool with automatic rule syncing")
    .passThroughOptions()
    .allowUnknownOption()
    .action(async (tool: string, toolArgs: string[], cmd: Command) => {
      const parentOpts = cmd.parent?.opts<{ config?: string }>();
      const { launchTool } = await import("../launch/launch.js");

      const result = await launchTool(tool, toolArgs, {
        configPath: parentOpts?.config || DEFAULT_CONFIG_PATH,
      });

      if (result.exitCode !== 0) {
        throw new SpawnError(tool, undefined, result.exitCode, undefined);
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = ensureError(error);

    if (err instanceof CommanderError) {
      return typeof err.exitCode === "number" ? err.exitCode : 1;
    }

    return err instanceof SpawnError && err.exitCode != null ? err.exitCode : 1;
  }

  return 0;
}
