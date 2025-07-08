import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import * as logger from "./utils/core.ts";
import { scan } from "./scan.ts";
import type { ScanOptions, FileInfo } from "./scan.ts";
import { mergeFiles } from "./merge.ts";
import type { MergeOptions } from "./merge.ts";
import { discoverProjects, validateProjects } from "./discovery.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scanAllProjects, getUserConfirmations } from "./multi-sync.ts";
import type { MultiSyncOptions, SyncAction } from "./multi-sync.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

/**
 * Validates the source and destination directory arguments.
 * Checks if directories exist, are accessible, and are not the same.
 *
 * @param src Source directory path
 * @param dst Destination directory path
 * @throws Error if validation fails
 */
async function validateDirectories(src: string, dst: string): Promise<void> {
  // Resolve to absolute paths for comparison
  const srcAbsolute = path.resolve(src);
  const dstAbsolute = path.resolve(dst);

  // Check if source and destination are the same
  if (srcAbsolute === dstAbsolute) {
    throw new Error("Source and destination directories cannot be the same");
  }

  // Check if source directory exists and is a directory
  try {
    const srcStat = await fs.stat(srcAbsolute);
    if (!srcStat.isDirectory()) {
      throw new Error(`Source path "${src}" is not a directory`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Source directory "${src}" does not exist`);
    }
    throw new Error(
      `Cannot access source directory "${src}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Check if destination directory exists, create if it doesn't
  try {
    const dstStat = await fs.stat(dstAbsolute);
    if (!dstStat.isDirectory()) {
      throw new Error(
        `Destination path "${dst}" exists but is not a directory`,
      );
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Destination doesn't exist, try to create it
      try {
        await fs.mkdir(dstAbsolute, { recursive: true });
        logger.log(`Created destination directory: ${dst}`);
      } catch (createError) {
        throw new Error(
          `Cannot create destination directory "${dst}": ${createError instanceof Error ? createError.message : String(createError)}`,
        );
      }
    } else {
      throw new Error(
        `Cannot access destination directory "${dst}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Test write permissions on destination
  try {
    await fs.access(dstAbsolute, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`No write permission for destination directory "${dst}"`);
  }
}

/**
 * Main entry point for the `sync-rules` CLI application.
 * Parses command-line arguments, orchestrates the scanning and merging processes,
 * and handles overall application flow and error reporting.
 *
 * @param argv An array of command-line arguments, typically `process.argv.slice(2)`.
 * @returns A promise that resolves when the command processing is complete.
 *          The process will exit with appropriate status codes:
 *          - 0: Success, no conflicts.
 *          - 1: Success, but with merge conflicts.
 *          - 2: Error during processing.
 *          - Commander.js also handles its own exit codes for argument errors.
 */
export async function main(argv: string[]) {
  const program = new Command();
  const version = packageJson.version || "unknown";

  program
    .name("sync-rules")
    .version(version, "-v, --version", "Output the current version")
    .description(
      "CLI tool to synchronize agent coding-tool rule files between projects.",
    )
    .argument(
      "[projects...]",
      "Project directory paths (if none provided, discovers all in base directory)",
    )
    .option(
      "--base-dir <path>",
      "Base directory for project discovery",
      path.join(homedir(), "Developer"),
    )
    .option(
      "--rules <names...>",
      "Specify rule directory/file names (e.g., .clinerules .cursorrules)",
      [".clinerules", ".cursorrules", ".kilocode"],
    )
    .option(
      "--exclude <patterns...>",
      "Exclude patterns (directories/files to skip)",
      ["memory-bank", "node_modules", ".git", ".DS_Store"],
    )
    .option("--dry-run", "Perform a dry run without actual changes")
    .option(
      "--auto-confirm",
      "Auto-confirm using newest versions (skip prompts)",
    )
    .option("--verbose", "Enable verbose logging")
    .action(async (projectPaths: string[], options) => {
      logger.setVerbose(options.verbose); // Set verbosity early

      try {
        let projects: ProjectInfo[];

        if (projectPaths.length === 0) {
          // Multi-project discovery mode
          logger.log(`Discovering projects in: ${options.baseDir}`);
          projects = await discoverProjects(
            options.baseDir,
            options.rules,
            options.exclude,
          );

          if (projects.length === 0) {
            logger.warn(
              `No projects with rule files found in ${options.baseDir}`,
            );
            process.exit(0);
          }

          logger.log(`Found ${projects.length} projects to synchronize:`);
          projects.forEach((project) => {
            logger.log(`  - ${project.name} (${project.path})`);
          });
        } else {
          // Specific projects mode
          logger.log(`Synchronizing ${projectPaths.length} specified projects`);

          // Validate all project paths
          await validateProjects(projectPaths);

          projects = projectPaths.map((projectPath) => ({
            name: path.basename(projectPath),
            path: path.resolve(projectPath),
          }));

          logger.log("Projects to synchronize:");
          projects.forEach((project) => {
            logger.log(`  - ${project.name} (${project.path})`);
          });
        }

        // Handle legacy two-project mode for backward compatibility
        if (projectPaths.length === 2) {
          return await handleLegacyTwoProjectMode(
            projectPaths[0]!,
            projectPaths[1]!,
            options,
          );
        }

        // Execute unified multi-project sync
        await executeUnifiedSync(projects, options);
      } catch (processError) {
        logger.error(
          "Error during synchronization process:",
          processError instanceof Error
            ? processError.message
            : String(processError),
        );
        if (
          processError instanceof Error &&
          processError.stack &&
          options.verbose
        ) {
          logger.debug(processError.stack);
        }
        logger.error("Exiting with status 2 (error).");
        process.exit(2);
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander typically handles errors and exits, but catch any unexpected ones
    if (error instanceof Error) {
      logger.error(`Unexpected error: ${error.message}`);
    } else {
      logger.error("An unexpected error occurred during command parsing.");
    }
    process.exit(1);
  }
}

/**
 * Executes the unified multi-project synchronization.
 */
async function executeUnifiedSync(
  projects: ProjectInfo[],
  options: any,
): Promise<void> {
  const multiSyncOptions: MultiSyncOptions = {
    rulePatterns: options.rules,
    excludePatterns: options.exclude,
    dryRun: options.dryRun || false,
    autoConfirm: options.autoConfirm || false,
    baseDir: options.baseDir,
  };

  logger.log("\nStarting unified synchronization...");

  // Scan all projects and build global file state
  const globalFileStates = await scanAllProjects(projects, multiSyncOptions);

  if (globalFileStates.size === 0) {
    logger.log("No rule files found across any projects.");
    process.exit(0);
  }

  // Get user confirmations and build sync plan
  const syncActions = await getUserConfirmations(
    globalFileStates,
    multiSyncOptions,
  );

  if (syncActions.length === 0) {
    logger.log("No synchronization needed - all files are already up to date.");
    process.exit(0);
  }

  // Show final summary and get confirmation before executing changes
  if (!multiSyncOptions.dryRun && !multiSyncOptions.autoConfirm) {
    logger.log(`\n=== Planned Changes Summary ===`);
    logger.log(`Total actions: ${syncActions.length}`);

    const updates = syncActions.filter((a) => a.type === "update").length;
    const additions = syncActions.filter((a) => a.type === "add").length;
    const deletions = syncActions.filter((a) => a.type === "delete").length;

    logger.log(`Updates: ${updates}`);
    logger.log(`Additions: ${additions}`);
    logger.log(`Deletions: ${deletions}`);

    const { confirm } = await import("./utils/prompts.ts");
    const proceedConfirmed = await confirm("\nProceed with these changes?");

    if (!proceedConfirmed) {
      logger.log("Synchronization cancelled by user.");
      process.exit(0);
    }
  }

  // Execute the sync plan
  const result = await executeSyncActions(
    syncActions,
    multiSyncOptions,
    projects,
  );

  // Report results
  logger.log("\n=== Synchronization Summary ===");
  logger.log(`Total actions: ${syncActions.length}`);
  logger.log(`Updates: ${result.updates}`);
  logger.log(`Additions: ${result.additions}`);
  logger.log(`Deletions: ${result.deletions}`);
  logger.log(`Skipped: ${result.skips}`);

  if (result.conflicts > 0) {
    logger.warn(
      `\n⚠️  Synchronization complete with ${result.conflicts} conflicts detected.`,
    );
    logger.warn(
      "Please review the affected files and ensure conflicts are resolved.",
    );
    process.exit(1);
  } else {
    logger.log("\n✅ Synchronization completed successfully!");
    process.exit(0);
  }
}

/**
 * Handles legacy two-project mode for backward compatibility.
 */
async function handleLegacyTwoProjectMode(
  src: string,
  dst: string,
  options: any,
): Promise<void> {
  logger.log("Detected two-project mode - using legacy sync method");
  logger.log("Source Directory:", src);
  logger.log("Destination Directory:", dst);

  // Validate directories before proceeding
  await validateDirectories(src, dst);

  const scanOptions: ScanOptions = {
    sourceDir: src,
    targetDir: dst,
    rulePatterns: options.rules,
    excludePatterns: options.exclude,
  };

  logger.log("Starting file synchronization process...");
  const scanResult = await scan(scanOptions);

  const mergeOptions: MergeOptions = {
    sourceDir: src,
    targetDir: dst,
    dryRun: options.dryRun || false,
  };

  const { anyConflicts } = await mergeFiles(scanResult, mergeOptions);

  // Provide summary
  logger.log("\n=== Synchronization Summary ===");
  logger.log(`Source files scanned: ${scanResult.sourceFiles.size}`);
  logger.log(`Target files scanned: ${scanResult.targetFiles.size}`);

  if (anyConflicts) {
    logger.warn("\n⚠️  Synchronization complete with conflicts detected.");
    process.exit(1);
  } else {
    logger.log("\n✅ Synchronization completed successfully!");
    process.exit(0);
  }
}

/**
 * Executes the sync actions and returns summary statistics.
 */
async function executeSyncActions(
  actions: SyncAction[],
  options: MultiSyncOptions,
  projects: ProjectInfo[],
): Promise<{
  updates: number;
  additions: number;
  deletions: number;
  skips: number;
  conflicts: number;
}> {
  let updates = 0,
    additions = 0,
    deletions = 0,
    skips = 0,
    conflicts = 0;

  // Create project lookup map
  const projectMap = new Map(projects.map((p) => [p.name, p.path]));

  for (const action of actions) {
    try {
      switch (action.type) {
        case "update":
          await executeUpdate(action, options, projectMap);
          updates++;
          break;
        case "add":
          await executeAdd(action, options, projectMap);
          additions++;
          break;
        case "delete":
          await executeDelete(action, options, projectMap);
          deletions++;
          break;
        case "skip":
          skips++;
          break;
      }
    } catch (error) {
      logger.error(
        `Failed to execute ${action.type} for ${action.relativePath}:`,
        error,
      );
      conflicts++;
    }
  }

  return { updates, additions, deletions, skips, conflicts };
}

/**
 * Executes an update action (file exists in both projects, source is newer).
 */
async function executeUpdate(
  action: SyncAction,
  options: MultiSyncOptions,
  projectMap: Map<string, string>,
): Promise<void> {
  if (!action.sourceFile || !action.targetFile) {
    throw new Error("Update action missing source or target file");
  }

  const targetProjectPath = projectMap.get(action.targetProject);
  if (!targetProjectPath) {
    throw new Error(`Project path not found for: ${action.targetProject}`);
  }

  const targetPath = path.join(targetProjectPath, action.relativePath);

  logger.log(
    `${options.dryRun ? "[DRY RUN] Would update" : "Updating"}: ${action.relativePath} in ${action.targetProject} from ${action.sourceProject}`,
  );

  if (!options.dryRun) {
    const destDir = path.dirname(targetPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(action.sourceFile.absolutePath, targetPath);
  }
}

/**
 * Executes an add action (file missing in target project).
 */
async function executeAdd(
  action: SyncAction,
  options: MultiSyncOptions,
  projectMap: Map<string, string>,
): Promise<void> {
  if (!action.sourceFile) {
    throw new Error("Add action missing source file");
  }

  const targetProjectPath = projectMap.get(action.targetProject);
  if (!targetProjectPath) {
    throw new Error(`Project path not found for: ${action.targetProject}`);
  }

  const targetPath = path.join(targetProjectPath, action.relativePath);

  logger.log(
    `${options.dryRun ? "[DRY RUN] Would add" : "Adding"}: ${action.relativePath} to ${action.targetProject} from ${action.sourceProject}`,
  );

  if (!options.dryRun) {
    const destDir = path.dirname(targetPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(action.sourceFile.absolutePath, targetPath);
  }
}

/**
 * Executes a delete action (file should be removed from project).
 */
async function executeDelete(
  action: SyncAction,
  options: MultiSyncOptions,
  projectMap: Map<string, string>,
): Promise<void> {
  if (!action.targetFile) {
    throw new Error("Delete action missing target file");
  }

  logger.log(
    `${options.dryRun ? "[DRY RUN] Would delete" : "Deleting"}: ${action.relativePath} from ${action.targetProject}`,
  );

  if (!options.dryRun) {
    await fs.unlink(action.targetFile.absolutePath);
  }
}
