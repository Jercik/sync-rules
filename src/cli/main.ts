import { Command, CommanderError } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { loadConfig, createSampleConfig } from "../config/loader.js";
import type { Project } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";

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
      const parentOpts = program.opts<{ config?: string }>();
      const config = await loadConfig(parentOpts.config || DEFAULT_CONFIG_PATH);

      const projectsToSync: Project[] = config.projects;

      const { syncProject } = await import("../core/sync.js");
      const { syncGlobal } = await import("../core/sync-global.js");
      const settlements = await Promise.allSettled(
        projectsToSync.map(async (project: Project) => {
          return await syncProject(project, { dryRun: false }, config);
        }),
      );

      // Collect and report failures with detailed context
      const failures: Array<{ project: Project; error: Error }> = [];

      settlements.forEach((settlement, index) => {
        if (settlement.status === "rejected") {
          const project = projectsToSync[index];
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

      // Success summary for better UX
      const successes = settlements.filter(
        (
          s,
        ): s is PromiseFulfilledResult<import("../core/sync.js").SyncResult> =>
          s.status === "fulfilled",
      );
      const projectWrites = successes.reduce(
        (acc, s) => acc + s.value.report.written.length,
        0,
      );
      // Perform global sync (once per run)
      const globalReport = await syncGlobal({ dryRun: false }, config);
      const totalWrites = projectWrites + globalReport.written.length;
      if (projectsToSync.length === 0) {
        console.log("No projects configured; nothing to do.");
      } else if (totalWrites === 0) {
        console.log("No changes. Rules matched no files or files up to date.");
      } else {
        let projectInfo: string;
        if (projectsToSync.length === 1) {
          const [firstProject] = projectsToSync;
          projectInfo = firstProject
            ? `project (${firstProject.path})`
            : "1 project(s)";
        } else {
          projectInfo = `${String(projectsToSync.length)} project(s)`;
        }
        console.log(
          `Synchronized ${projectInfo}; wrote ${String(totalWrites)} file(s).`,
        );
      }
    });

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
