import { Command } from "commander";
import chalk from "chalk";
import packageJson from "../../package.json" with { type: "json" };
import { DEFAULT_CONFIG_PATH } from "../config/constants.ts";
import { loadConfig, createSampleConfig } from "../config/loader.ts";
import { createPathGuardFromConfig } from "../core/path-guard.ts";
import { printProjectReport } from "../core/reporting.ts";
import type { ProjectReport } from "../core/reporting.ts";
import type { Project } from "../config/config.ts";
import type { SyncResult } from "../core/sync.ts";
import {
  SyncError,
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
  ensureError,
} from "../utils/errors.ts";

async function runSync(options: {
  config: string;
  dryRun?: boolean;
  verbose?: boolean;
}) {
  // Expose verbose mode to logger before dynamic imports
  if (options.verbose) {
    process.env.SYNC_RULES_VERBOSE = "1";
  }

  // Surface log file location in verbose mode when file logging is enabled
  if (options.verbose) {
    const logLevel = process.env.LOG_LEVEL || "silent";
    const isLaunch = process.env.SYNC_RULES_LAUNCH === "1";
    if (logLevel !== "silent" || isLaunch) {
      console.log(chalk.gray("log file: ~/.sync-rules/debug.log"));
    }
  }
  // Load config and create path guard
  const config = await loadConfig(options.config);
  const pathGuard = createPathGuardFromConfig(config);

  const results = await Promise.allSettled(
    config.projects.map(async (project: Project) => {
      const { syncProject } = await import("../core/sync.ts");
      return await syncProject(project, {
        dryRun: options.dryRun,
        verbose: options.verbose,
        pathGuard,
        rulesSource: config.rulesSource,
      });
    }),
  );

  // Process results to create comprehensive report
  const projectReports: ProjectReport[] = [];
  const failedProjects: { project: string; error: unknown }[] = [];

  results.forEach((result: PromiseSettledResult<SyncResult>, index: number) => {
    const project = config.projects[index];
    if (!project) return; // Safety check

    if (result.status === "fulfilled") {
      projectReports.push(result.value);
    } else {
      // Handle rejected promises
      const error = result.reason;
      failedProjects.push({
        project: project.path,
        error,
      });

      // Create a failure report for this project
      projectReports.push({
        projectPath: project.path,
        report: {
          success: false,
          written: [],
          errors: [ensureError(error)],
        },
      });

      // Log detailed error information
      if (error instanceof SyncError) {
        console.error(chalk.red(error.toFormattedString()));
      } else if (error instanceof Error) {
        // Handle regular errors
        console.error(
          `${chalk.red("✗")} Error syncing project '${project.path}':`,
          error.message,
        );
      } else {
        // Fallback for non-Error types
        console.error(
          `${chalk.red("✗")} Error syncing project '${project.path}':`,
          String(error),
        );
      }
    }
  });

  const allSucceeded = printProjectReport(projectReports, {
    verbose: options.verbose,
    dryRun: options.dryRun,
  });

  // Log summary of failures if any
  if (failedProjects.length > 0) {
    console.log(
      chalk.yellow(
        `\n⚠️  ${failedProjects.length} project(s) failed synchronization`,
      ),
    );
    if (options.verbose) {
      console.log(chalk.yellow("Failed projects:"));
      failedProjects.forEach(({ project }) => {
        console.log(chalk.yellow(`  - ${project}`));
      });
    }
  }

  if (!allSucceeded) {
    process.exit(1);
  }
}

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]) {
  const program = new Command();

  // Configure program
  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version, "-v, --version", "Output the current version")
    .option(
      "-c, --config <path>",
      "Path to configuration file",
      DEFAULT_CONFIG_PATH,
    )
    .option("-d, --dry-run", "Preview changes without applying them", false)
    .option("--verbose", "Enable verbose output", false)
    .enablePositionalOptions(); // Required for passThroughOptions to work on subcommands

  // Add init command to create sample config
  program
    .command("init")
    .description("Initialize a new configuration file")
    .option("-f, --force", "Overwrite existing config file", false)
    .action(async (options) => {
      try {
        const parentOpts = program.opts();
        const configPath = parentOpts.config || DEFAULT_CONFIG_PATH;

        // Check if config already exists
        try {
          await loadConfig(configPath);
          if (!options.force) {
            console.log(
              chalk.yellow(`Config file already exists at: ${configPath}`),
            );
            console.log(chalk.yellow("Use --force to overwrite"));
            process.exit(1);
          }
        } catch {
          // Config doesn't exist, which is what we want
        }

        await createSampleConfig(configPath);
        console.log(chalk.green(`✓ Created config file at: ${configPath}`));
        console.log(chalk.gray("\nNext steps:"));
        console.log(chalk.gray("1. Edit the config file to add your projects"));
        console.log(chalk.gray("2. Run 'sync-rules' to synchronize rules"));
      } catch (error) {
        handleError(ensureError(error));
        process.exit(1);
      }
    });

  // Add explicit sync subcommand (default when no command is specified)
  program
    .command("sync", { isDefault: true })
    .description("Synchronize rules across all configured projects (default)")
    .action(async () => {
      try {
        // Get options from parent command
        const options = program.opts();
        await runSync({
          config: options.config || DEFAULT_CONFIG_PATH,
          dryRun: options.dryRun,
          verbose: options.verbose,
        });
      } catch (error) {
        handleError(ensureError(error));
        process.exit(1);
      }
    });

  // Add launch subcommand
  const launchCommand = program
    .command("launch <tool> [toolArgs...]")
    .description("Launch an AI tool with automatic rule syncing")
    .option("--no-sync", "Skip rule synchronization check")
    .option("--force", "Force sync even if rules appear up-to-date")
    .passThroughOptions() // Everything after -- is passed through untouched
    .allowUnknownOption(); // Allow unknown options to be passed through

  // Mark launch context for logger before the action runs
  launchCommand.hook("preAction", () => {
    process.env.SYNC_RULES_LAUNCH = "1";
  });

  launchCommand.action(async (tool, toolArgs) => {
    try {
      const parentOpts = program.opts();
      const opts = launchCommand.opts();

      // Indicate verbose context for downstream code if needed
      if (parentOpts.verbose) {
        process.env.SYNC_RULES_VERBOSE = "1";
      }

      // Surface log file location in verbose mode when file logging is enabled
      if (parentOpts.verbose) {
        const logLevel = process.env.LOG_LEVEL || "silent";
        const isLaunch = process.env.SYNC_RULES_LAUNCH === "1";
        if (logLevel !== "silent" || isLaunch) {
          console.log(chalk.gray("log file: ~/.sync-rules/debug.log"));
        }
      }

      // Logging removed - use LOG_LEVEL env var to enable debug logging

      const { launchTool } = await import("../launch/launch.ts");
      const exitCode = await launchTool(tool, toolArgs, {
        configPath: parentOpts.config || DEFAULT_CONFIG_PATH,
        noSync: opts.noSync,
        force: opts.force,
        verbose: parentOpts.verbose,
      });
      process.exit(exitCode);
    } catch (error) {
      const err = ensureError(error);
      // Error already handled by handleError
      handleError(err);
      if (err instanceof SpawnError) {
        process.exit(err.exitCode ?? 1);
      }
      process.exit(1);
    }
  });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = ensureError(error);
    // Error already handled by handleError
    handleError(err);
    process.exit(1);
  }
}

/**
 * Centralized error handler that formats error messages consistently.
 */
function handleError(error: Error): void {
  if (error instanceof ConfigNotFoundError) {
    console.error(`${chalk.red("✗ Error:")} ${error.message}`);

    // Add helpful guidance for default config case
    if (error.isDefault) {
      console.error(
        `\n${chalk.yellow("Config file not found at:")} ${DEFAULT_CONFIG_PATH}`,
      );
      console.error("\nYou can:");
      console.error(
        `  1. Run ${chalk.cyan("sync-rules init")} to create a sample config`,
      );
      console.error(
        `  2. Create a config file manually at ${chalk.gray(DEFAULT_CONFIG_PATH)}`,
      );
      console.error(
        `  3. Specify a custom config path with ${chalk.gray("-c <path>")}`,
      );
      console.error(
        `  4. Set ${chalk.gray("SYNC_RULES_CONFIG")} environment variable`,
      );
      console.error("\nExample config structure:");
      console.error(`{
  "projects": [
    {
      "path": "/path/to/project",
      "adapters": ["claude"],
      "rules": ["**/*.md"]
    }
  ]
}`);
    }
  } else if (error instanceof ConfigParseError) {
    console.error(`${chalk.red("✗ Error:")} ${error.message}`);
  } else if (error instanceof SpawnError) {
    console.error(`${chalk.red("✗")} ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`${chalk.red("✗ Error:")} ${error.message}`);
  } else {
    console.error(
      `${chalk.red("✗ Error:")} An unexpected error occurred:`,
      String(error),
    );
  }
}
