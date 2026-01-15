import { Command, CommanderError } from "@commander-js/extra-typings";
import packageJson from "../../package.json" with { type: "json" };
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_RULES_SOURCE,
} from "../config/constants.js";
import { createSampleConfig, loadConfig } from "../config/loader.js";
import { ConfigNotFoundError, ensureError } from "../utils/errors.js";
import { normalizePath } from "../utils/paths.js";
import { runSyncCommand } from "./run-sync-command.js";

type ResolvedPaths = {
  configPath: string;
  rulesSource: string;
  error?: Error;
};

type CliOptions = {
  config: string;
  verbose?: boolean;
  dryRun?: boolean;
  porcelain?: boolean;
  init?: boolean;
  force?: boolean;
  paths?: boolean;
};

async function resolvePaths(configPath: string): Promise<ResolvedPaths> {
  const normalizedPath = normalizePath(configPath);
  try {
    const config = await loadConfig(configPath);
    return { configPath: normalizedPath, rulesSource: config.rulesSource };
  } catch (error) {
    const error_ = ensureError(error);
    if (error_ instanceof ConfigNotFoundError) {
      return { configPath: normalizedPath, rulesSource: DEFAULT_RULES_SOURCE };
    }
    return {
      configPath: normalizedPath,
      rulesSource: DEFAULT_RULES_SOURCE,
      error: error_,
    };
  }
}

function printPaths(paths: ResolvedPaths): void {
  console.log("NAME\tPATH");
  console.log(`CONFIG\t${paths.configPath}`);
  console.log(`RULES_SOURCE\t${paths.rulesSource}`);
}

/**
 * Entry point for the CLI application.
 * Parses arguments, registers subcommands, and dispatches to handlers.
 *
 * @param argv - The raw argv array (typically `process.argv`)
 */
export async function main(argv: string[]): Promise<number> {
  const program = new Command<[], CliOptions>()
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
    .option("--paths", "print resolved config and rules source paths")
    .option("-n, --dry-run", "preview changes without writing files")
    .option("--porcelain", "machine-readable output (implies --dry-run)")
    .option("-v, --verbose", "enable verbose output")
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError()
    .exitOverride()
    .configureHelp({
      sortOptions: true,
    });
  program.addHelpText(
    "after",
    `
Resolved defaults:
  CONFIG: ${DEFAULT_CONFIG_PATH}
  RULES_SOURCE: ${DEFAULT_RULES_SOURCE}

Examples:
  sync-rules                        # Sync all projects (default)
  sync-rules --init                 # Create a sample config file
  sync-rules --paths                # Print resolved config and rules paths
  sync-rules --porcelain | tail -n +2 | wc -l   # Count files that would be written`,
  );
  program.action(async (options) => {
    const configPath = normalizePath(options.config);
    const wantsInit = options.init ?? false;
    const wantsPaths = options.paths ?? false;
    const wantsSyncFlags =
      (options.dryRun ?? false) || (options.porcelain ?? false);

    if (options.force && !wantsInit) {
      throw new Error("--force can only be used with --init");
    }
    if (wantsInit && wantsPaths) {
      throw new Error("Use only one of --init or --paths");
    }
    if ((wantsInit || wantsPaths) && wantsSyncFlags) {
      throw new Error("--dry-run and --porcelain apply only to sync");
    }

    if (wantsInit) {
      await createSampleConfig(configPath, options.force ?? false);
      return;
    }

    if (wantsPaths) {
      const resolved = await resolvePaths(configPath);
      printPaths(resolved);
      if (resolved.error) {
        throw resolved.error;
      }
      return;
    }

    await runSyncCommand({
      configPath,
      verbose: options.verbose ?? false,
      dryRun: options.dryRun ?? options.porcelain ?? false,
      porcelain: options.porcelain ?? false,
    });
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
