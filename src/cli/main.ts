import { Command, CommanderError, Option } from "commander";
import { access, constants as FS } from "node:fs/promises";
import packageJson from "../../package.json" with { type: "json" };
import type { LevelWithSilent } from "pino";
import { getLogger, getLogFilePath, rootLogger } from "../utils/log.js";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { LogLevel } from "../config/config.js";
import { loadConfig, createSampleConfig } from "../config/loader.js";
import { printProjectReport } from "../core/reporting.js";
import type { ProjectReport } from "../core/reporting.js";
import type { Project } from "../config/config.js";
import type { SyncResult } from "../core/sync.js";
import {
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
  ensureError,
  ProjectNotFoundError,
  AdapterNotConfiguredError,
} from "../utils/errors.js";
const logger = getLogger("cli");

/**
 * Check if a config file exists without attempting to parse it.
 * This prevents accidentally overwriting invalid but existing configs.
 */
async function configExists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function applyCliLogging(logLevel?: string) {
  if (logLevel && LogLevel.safeParse(logLevel).success) {
    rootLogger.level = logLevel as LevelWithSilent;
  }
}

async function runSync(options: {
  config: string;
  dryRun?: boolean;
  logLevel?: string;
}): Promise<{ ok: boolean; reports: ProjectReport[] }> {
  // Configure logger level from CLI options
  applyCliLogging(options.logLevel);

  if (options.logLevel === "debug" || options.logLevel === "trace") {
    logger.info(`log file: ${getLogFilePath()}`);
  }

  const config = await loadConfig(options.config);

  const settlements = await Promise.allSettled(
    config.projects.map(async (project: Project) => {
      const { syncProject } = await import("../core/sync.js");
      return await syncProject(
        project,
        { dryRun: !!options.dryRun },
        { rulesSource: config.rulesSource },
      );
    }),
  );

  const reports: ProjectReport[] = settlements.map(
    (result: PromiseSettledResult<SyncResult>, index: number) => {
      const project = config.projects[index]!;
      if (result.status === "fulfilled") return result.value;
      return {
        projectPath: project.path,
        report: { written: [] },
        failed: true,
        error: ensureError(result.reason),
      };
    },
  );

  const ok = printProjectReport(reports, { dryRun: options.dryRun });
  return { ok, reports };
}

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]): Promise<number> {
  const program = new Command();
  let exitCode = 0;

  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version)
    .option(
      "-c, --config <path>",
      "Path to configuration file",
      DEFAULT_CONFIG_PATH,
    )
    .option("-d, --dry-run", "Preview changes without applying them", false)
    .addOption(
      new Option("--log-level <level>", "Set log level")
        .choices(LogLevel.options as unknown as string[])
        .default("info"),
    )
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError()
    .exitOverride()
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
      showGlobalOptions: true,
    })
    .configureOutput({
      writeErr: (str) => console.error(str),
      writeOut: (str) => console.log(str),
    });

  program
    .command("init")
    .description("Initialize a new configuration file")
    .option("-f, --force", "Overwrite existing config file", false)
    .addHelpText(
      "after",
      "\nThis command creates a sample configuration file with example settings.",
    )
    .action(async (options) => {
      const parentOpts = program.opts();
      const configPath = parentOpts.config || DEFAULT_CONFIG_PATH;

      const exists = await configExists(configPath);
      if (exists && !options.force) {
        program.error(
          `Config file already exists at: ${configPath}. Use --force to overwrite`,
        );
      }

      await createSampleConfig(configPath);
      logger.info(`✓ Created config file at: ${configPath}`);
      logger.info("\nNext steps:");
      logger.info("1. Edit the config file to add your projects");
      logger.info("2. Run 'sync-rules' to synchronize rules");
    });

  program
    .command("sync", { isDefault: true })
    .description("Synchronize rules across all configured projects (default)")
    .addHelpText(
      "after",
      "\nThis is the default command when no subcommand is specified.",
    )
    .action(async () => {
      const options = program.opts();
      const { ok } = await runSync({
        config: options.config || DEFAULT_CONFIG_PATH,
        dryRun: options.dryRun,
        logLevel: options.logLevel,
      });
      if (!ok) {
        program.error("One or more projects failed synchronization", {
          exitCode: 1,
        });
      }
    });

  const launchCommand = program
    .command("launch <tool> [toolArgs...]")
    .description("Launch an AI tool with automatic rule syncing")
    .option("--no-sync", "Skip rule synchronization check")
    .addHelpText(
      "after",
      "\nPass arguments to the tool after --. Examples:\n  $ sync-rules launch claude -- -p 'Review these changes'\n  $ sync-rules launch gemini -- --model gemini-2.5-pro\n  $ sync-rules launch --no-sync claude -- -p 'Quick run'",
    );

  launchCommand.action(async (tool, toolArgs) => {
    const parentOpts = program.opts();
    const opts = launchCommand.opts();

    // Configure logger level for launch subcommand as well
    applyCliLogging(parentOpts.logLevel);

    if (parentOpts.logLevel === "debug" || parentOpts.logLevel === "trace") {
      logger.info(`log file: ${getLogFilePath()}`);
    }

    const { launchTool } = await import("../launch/launch.js");
    const result = await launchTool(tool, toolArgs, {
      configPath: parentOpts.config || DEFAULT_CONFIG_PATH,
      noSync: opts.noSync,
    });

    printProjectReport([result.projectReport], {
      dryRun: false,
    });

    if (result.exitCode === 0) {
      logger.info(`✓ Launched ${tool} successfully`);
    } else {
      logger.info(`${tool} exited with code ${result.exitCode}`);
    }

    // Capture exit code for return from main()
    exitCode = result.exitCode;
  });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = ensureError(error);

    // Commander errors are already displayed by configureOutput
    // Only handle our custom errors
    if (!(err instanceof CommanderError)) {
      handleError(err);
    }

    // Prefer Commander-provided exitCode when available
    if (err instanceof CommanderError) {
      return typeof err.exitCode === "number" ? err.exitCode : 1;
    }

    // Fall back to SpawnError exit code or generic 1
    return err instanceof SpawnError && err.exitCode != null ? err.exitCode : 1;
  }

  return exitCode;
}

/**
 * Centralized error handler that formats error messages consistently.
 */
function handleError(error: Error): void {
  if (error instanceof ConfigNotFoundError) {
    logger.error(`Error: ${error.message}`);

    if (error.isDefault) {
      logger.info(`\nConfig file not found at: ${DEFAULT_CONFIG_PATH}`);
      logger.info("\nYou can:");
      logger.info(`  1. Run sync-rules init to create a sample config`);
      logger.info(
        `  2. Create a config file manually at ${DEFAULT_CONFIG_PATH}`,
      );
      logger.info(`  3. Specify a custom config path with -c <path>`);
      logger.info(`  4. Set SYNC_RULES_CONFIG environment variable`);
    }
  } else if (error instanceof ConfigParseError) {
    logger.error(`Error: ${error.message}`);
  } else if (error instanceof ProjectNotFoundError) {
    logger.error(`Error: ${error.message}`);
    logger.info("\nEnsure this directory is listed in your config.");
    logger.info("Use -c <path> to point to the correct config.");
  } else if (error instanceof AdapterNotConfiguredError) {
    logger.error(`Error: ${error.message}`);
    logger.info(
      "\nAdd the adapter to the project's adapters list in the config.",
    );
  } else if (error instanceof SpawnError) {
    logger.error(error.message);
  } else if (error instanceof Error) {
    logger.error(`Error: ${error.message}`);
  } else {
    logger.error(`Error: An unexpected error occurred: ${String(error)}`);
  }
}
