import { Command } from "commander";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import packageJson from "../package.json" with { type: "json" };
import { getAdapter } from "./adapters/index.ts";
import { parseConfig } from "./config.ts";
import { CENTRAL_RULES_PATH, DEFAULT_CONFIG_PATH } from "./constants.ts";
import { executeActions } from "./execution.ts";
import {
  globRulePaths,
  filterValidMdPaths,
  readRuleContents,
} from "./filesystem.ts";
import { normalizePath } from "./utils.ts";
import type { FSAction } from "./utils.ts";
import { printProjectReport } from "./reporting.ts";

export async function main(argv: string[]) {
  const program = new Command();

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
    .action(async (options) => {
      try {
        // Read and parse config
        const configPath = normalizePath(options.config);
        let configContent: string;

        try {
          configContent = await readFile(configPath, "utf8");
        } catch (error) {
          if (configPath === DEFAULT_CONFIG_PATH) {
            console.error(
              `${chalk.red("✗ Error:")} Default config file not found at ${DEFAULT_CONFIG_PATH}`,
            );
            console.error(
              "\nPlease create a config file at the default location or specify one with -c <path>",
            );
            console.error("\nExample config structure:");
            console.error(`{
  "projects": [
    {
      "path": "/path/to/project",
      "adapters": ["kilocode"],
      "rules": ["**/*.md"]
    }
  ]
}`);
            process.exit(1);
          }
          throw error;
        }

        const config = parseConfig(configContent);

        // Process all projects in parallel
        const projectReports = await Promise.all(
          config.projects.map(async (project) => {
            const allActions: FSAction[] = [];

            // Process rules for all adapters
            for (const adapterName of project.adapters) {
              try {
                // Get the adapter function
                const adapter = getAdapter(adapterName);

                // Find and read rule files from central repository
                const rulePaths = await globRulePaths(
                  CENTRAL_RULES_PATH,
                  project.rules,
                );
                const validPaths = await filterValidMdPaths(
                  CENTRAL_RULES_PATH,
                  rulePaths,
                );
                const rules = await readRuleContents(
                  CENTRAL_RULES_PATH,
                  validPaths,
                );

                // Generate actions for this adapter
                const actions = adapter({
                  projectPath: project.path,
                  rules,
                });

                allActions.push(...actions);
              } catch (error) {
                console.error(
                  `${chalk.red("✗")} Error processing adapter '${adapterName}' for project '${project.path}':`,
                  error instanceof Error ? error.message : String(error),
                );
                // Always fail fast on adapter errors
                throw error;
              }
            }

            // Execute actions for this project
            const report = await executeActions(allActions, {
              dryRun: options.dryRun,
              verbose: options.verbose,
            });

            return { project: project.path, report };
          }),
        );

        // Pretty-print results
        const allSucceeded = printProjectReport(projectReports, {
          verbose: options.verbose,
          dryRun: options.dryRun,
        });

        // Exit with error code if any failures
        if (!allSucceeded) {
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(`${chalk.red("✗ Error:")} ${error.message}`);
        } else {
          console.error(chalk.red("✗ An unexpected error occurred"));
        }
        process.exit(1);
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Unexpected error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred during command parsing.");
    }
    process.exit(1);
  }
}
