import { Command } from "commander";
import chalk from "chalk";
import packageJson from "../package.json" with { type: "json" };
import { DEFAULT_CONFIG_PATH } from "./config/constants.ts";
import { loadConfig } from "./config/config-loader.ts";
import { createPathGuardFromConfig } from "./core/path-guard.ts";
import { printProjectReport } from "./core/reporting.ts";
import { ensureError } from "./utils/logger.ts";
import type { ProjectReport } from "./core/reporting.ts";
import {
  SyncError,
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
  EditorOpenError,
} from "./utils/errors.ts";

async function runSync(options: {
  config: string;
  dryRun?: boolean;
  verbose?: boolean;
}) {
  // Load config and create path guard
  const config = await loadConfig(options.config);
  const pathGuard = createPathGuardFromConfig(config);

  const results = await Promise.allSettled(
    config.projects.map(async (project) => {
      const { syncProject } = await import("./core/sync.ts");
      return await syncProject(project, {
        dryRun: options.dryRun,
        verbose: options.verbose,
        pathGuard,
      });
    }),
  );

  // Process results to create comprehensive report
  const projectReports: ProjectReport[] = [];
  const failedProjects: { project: string; error: unknown }[] = [];

  results.forEach((result, index) => {
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
          changes: { written: [] },
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

  // Add explicit sync subcommand
  program
    .command("sync")
    .description("Synchronize rules across all configured projects")
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
        handleError(error);
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

  launchCommand.action(async (tool, toolArgs) => {
    try {
      const parentOpts = program.opts();
      const opts = launchCommand.opts();

      const { launchTool } = await import("./launch/launch.ts");
      const exitCode = await launchTool(tool, toolArgs, {
        configPath: parentOpts.config || DEFAULT_CONFIG_PATH,
        noSync: opts.noSync,
        force: opts.force,
        verbose: parentOpts.verbose,
      });
      process.exit(exitCode);
    } catch (error) {
      handleError(error);
      if (error instanceof SpawnError) {
        process.exit(error.exitCode ?? 1);
      }
      process.exit(1);
    }
  });

  // No default action - running without a subcommand shows help
  // Commander.js automatically shows help when no subcommand is provided

  try {
    await program.parseAsync(argv);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

/**
 * Centralized error handler that formats error messages consistently.
 */
function handleError(error: unknown): void {
  if (error instanceof ConfigNotFoundError) {
    if (error.isDefault) {
      console.error(
        `${chalk.red("✗ Error:")} Default config file not found at ${error.path}`,
      );
      console.error(
        "\nPlease create a config file at the default location or specify one with -c <path>",
      );
      console.error("\nExample config structure:");
      console.error(`{
  "projects": [
    {
      "path": "/path/to/project",
      "adapters": ["claude", "kilocode"],
      "rules": ["**/*.md"]
    }
  ]
}`);
    } else {
      console.error(
        `${chalk.red("✗ Error:")} Config file not found at ${error.path}`,
      );
    }
  } else if (error instanceof ConfigParseError) {
    console.error(
      `${chalk.red("✗ Error:")} Failed to load config from ${error.path}:`,
      error.originalError?.message || error.message,
    );
  } else if (error instanceof SpawnError) {
    if (error.code === "ENOENT") {
      console.error(`${chalk.red("✗")} ${error.message}`);
    } else {
      console.error(
        `${chalk.red("✗")} Failed to launch "${error.command}": ${error.message}`,
      );
    }
  } else if (error instanceof EditorOpenError) {
    console.error(
      `${chalk.red("✗ Error:")} Could not open editor for ${error.path}:`,
      error.originalError?.message || error.message,
    );
  } else if (error instanceof Error) {
    console.error(`${chalk.red("✗ Error:")} ${error.message}`);
  } else {
    console.error(
      `${chalk.red("✗ Error:")} An unexpected error occurred:`,
      String(error),
    );
  }
}
