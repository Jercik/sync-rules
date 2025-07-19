#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import * as logger from "./utils/core.ts";
import { safeAccess } from "./utils/core.ts";
import { discoverProjects, validateProjects } from "./discovery.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scanAllProjects, getUserConfirmations } from "./multi-sync.ts";
import type { MultiSyncOptions, SyncAction } from "./multi-sync.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createProjectMap } from "./utils/project-utils.ts";
import { preparationPhase, planningPhase, executionPhase, generationPhase } from "./utils/sync-phases.ts";

/**
 * Main entry point for the `sync-rules` CLI application.
 * Parses command-line arguments, orchestrates multi-project synchronization,
 * and handles overall application flow and error reporting.
 *
 * @param argv An array of command-line arguments, typically `process.argv`.
 * @returns A promise that resolves when the command processing is complete.
 *          The process will exit with appropriate status codes:
 *          - 0: Success, all files synchronized (or no synchronization needed) and CLAUDE.md generated successfully (if enabled).
 *          - 1: Partial success with errors during file operations, including sync errors or CLAUDE.md generation failures.
 *          - 2: Fatal error during processing (e.g., invalid arguments, no projects found).
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
      "Specify rule directory/file names (e.g., .clinerules.md .cursorrules.md)",
      [".clinerules.md", ".cursorrules.md", ".kilocode"],
    )
    .option(
      "--exclude <patterns...>",
      "Exclude patterns (directories/files to skip)",
      ["memory-bank", "node_modules", ".git", "CLAUDE.md"], // Exclude CLAUDE.md by default
    )
    .option("--dry-run", "Perform a dry run without actual changes")
    .option(
      "--auto-confirm",
      "Auto-confirm using newest versions (skip prompts). Automatically selects the file with the most recent modification date as the source of truth",
    )
    .option(
      "--force",
      "Force overwrite existing files when adding (use with caution)",
    )
    .option(
      "--generate-claude",
      "Generate CLAUDE.md after successful sync",
      true,
    )
    .option("--no-generate-claude", "Skip CLAUDE.md generation")
    .option("--verbose", "Enable verbose logging")
    .action(async (projectPaths: string[], options): Promise<void> => {
      logger.setVerbose(options.verbose); // Set verbosity early

      try {
        let projects: ProjectInfo[];

        if (projectPaths.length === 0) {
          // Multi-project discovery mode
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

          projects = projectPaths.map((projectPath) => {
            const resolvedPath = path.resolve(projectPath);
            return {
              name: path.basename(resolvedPath),
              path: resolvedPath,
            };
          });

          logger.log("Projects to synchronize:");
          projects.forEach((project) => {
            logger.log(`  - ${project.name} (${project.path})`);
          });
        }

        // Execute unified multi-project sync
        const exitCode = await executeUnifiedSync(projects, options);
        process.exit(exitCode);
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
 * Executes the unified multi-project synchronization using a phased approach.
 * @returns Exit code: 0 for success, 1 for errors
 */
export async function executeUnifiedSync(
  projects: ProjectInfo[],
  options: any,
): Promise<number> {
  // Validate project names first
  try {
    createProjectMap(projects);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    logger.error("Please ensure all project directories have unique names.");
    return 2; // Configuration error
  }

  // Phase 1: Preparation
  const prepResult = await preparationPhase(projects, options);
  if (!prepResult.success || !prepResult.shouldContinue) {
    // If no files found or preparation failed
    if (prepResult.success && !prepResult.shouldContinue && prepResult.data) {
      // No files found case - still run generation if requested
      const genResult = await generationPhase(projects, options, 0);
      return genResult.data || 0;
    }
    return prepResult.errors ? 1 : 0;
  }

  const { globalFileStates } = prepResult.data!;
  const multiSyncOptions: MultiSyncOptions = {
    rulePatterns: options.rules,
    excludePatterns: options.exclude,
    dryRun: options.dryRun || false,
    autoConfirm: options.autoConfirm || false,
    baseDir: options.baseDir,
    force: options.force || false,
  };

  // Phase 2: Planning
  const planResult = await planningPhase(
    projects,
    globalFileStates,
    multiSyncOptions,
  );
  
  if (!planResult.success) {
    return 1;
  }
  
  if (!planResult.shouldContinue) {
    // No sync needed or user cancelled
    if (planResult.data?.userCancelled) {
      return 0; // User cancelled, exit cleanly
    }
    
    // No sync needed - generate CLAUDE.md
    const genResult = await generationPhase(projects, options, 0);
    return genResult.data || 0;
  }

  const { syncActions } = planResult.data!;

  // Phase 3: Execution
  const execResult = await executionPhase(
    projects,
    syncActions,
    multiSyncOptions,
  );
  
  if (!execResult.success) {
    return 1;
  }

  const syncErrors = execResult.data?.errors || 0;

  // Phase 4: Generation
  const genResult = await generationPhase(projects, options, syncErrors);
  return genResult.data || 0;
}

/**
 * Executes the sync actions and returns summary statistics.
 */
export async function executeSyncActions(
  actions: SyncAction[],
  options: MultiSyncOptions,
  projects: ProjectInfo[],
): Promise<{
  updates: number;
  additions: number;
  deletions: number;
  skips: number;
  errors: number;
}> {
  let updates = 0,
    additions = 0,
    deletions = 0,
    skips = 0,
    errors = 0;

  // Create project lookup map
  let projectMap: Map<string, string>;
  try {
    projectMap = createProjectMap(projects);
  } catch (error) {
    // This should have been caught earlier, but handle it gracefully
    logger.error("Project name validation failed during execution:", error);
    throw error;
  }

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
      errors++;
    }
  }

  return { updates, additions, deletions, skips, errors };
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

  if (!options.dryRun) {
    logger.log(
      `Updating: ${action.relativePath} in ${action.targetProject} from ${action.sourceProject}`,
    );
    const destDir = path.dirname(targetPath);
    await fs.mkdir(destDir, { recursive: true });
    // For updates, we expect the file to exist, so we don't use COPYFILE_EXCL
    await fs.copyFile(action.sourceFile.absolutePath, targetPath);
  } else {
    // Dry-run mode - check write permissions
    const destDir = path.dirname(targetPath);
    const canWrite = await safeAccess(destDir, fs.constants.W_OK, "update", action.targetProject);
    
    if (canWrite) {
      logger.log(
        `[DRY RUN] Would update: ${action.relativePath} in ${action.targetProject} from ${action.sourceProject}`,
      );
    } else {
      logger.warn(
        `[DRY RUN] Would fail to update: ${action.relativePath} in ${action.targetProject} - directory is not writable`,
      );
    }
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

  if (!options.dryRun) {
    const destDir = path.dirname(targetPath);
    await fs.mkdir(destDir, { recursive: true });
    
    try {
      // Use COPYFILE_EXCL to fail if file exists (atomic check and copy)
      await fs.copyFile(action.sourceFile.absolutePath, targetPath, fs.constants.COPYFILE_EXCL);
      logger.log(
        `Adding: ${action.relativePath} to ${action.targetProject} from ${action.sourceProject}`,
      );
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // File already exists
        if (options.force) {
          // Force overwrite
          await fs.copyFile(action.sourceFile.absolutePath, targetPath);
          logger.warn(
            `⚠️  Overwriting existing file (--force): ${action.relativePath} in ${action.targetProject}`,
          );
        } else {
          // Skip with warning
          logger.warn(
            `⚠️  Skipping existing file: ${action.relativePath} in ${action.targetProject} (use --force to overwrite)`,
          );
        }
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  } else {
    // Dry run mode - check existence right before we would copy
    let fileExists = false;
    try {
      await fs.access(targetPath);
      fileExists = true;
    } catch {
      // File doesn't exist, which is expected
    }

    // Check write permissions on the destination directory
    const destDir = path.dirname(targetPath);
    const canWrite = await safeAccess(destDir, fs.constants.W_OK, "add", action.targetProject);

    if (!canWrite) {
      logger.warn(
        `⚠️  [DRY RUN] Would fail to add: ${action.relativePath} in ${action.targetProject} - directory is not writable`,
      );
    } else if (fileExists) {
      if (options.force) {
        logger.warn(
          `⚠️  [DRY RUN] Would overwrite existing file (--force): ${action.relativePath} in ${action.targetProject}`,
        );
      } else {
        logger.warn(
          `⚠️  [DRY RUN] Would skip existing file: ${action.relativePath} in ${action.targetProject} (use --force to overwrite)`,
        );
      }
    } else {
      logger.log(
        `[DRY RUN] Would add: ${action.relativePath} to ${action.targetProject} from ${action.sourceProject}`,
      );
    }
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

  if (!options.dryRun) {
    logger.log(
      `Deleting: ${action.relativePath} from ${action.targetProject}`,
    );
    await fs.unlink(action.targetFile.absolutePath);
  } else {
    // Dry-run mode - check if we can delete the file
    const canDelete = await safeAccess(action.targetFile.absolutePath, fs.constants.W_OK, "delete", action.targetProject);
    
    if (canDelete) {
      logger.log(
        `[DRY RUN] Would delete: ${action.relativePath} from ${action.targetProject}`,
      );
    } else {
      logger.warn(
        `[DRY RUN] Would fail to delete: ${action.relativePath} from ${action.targetProject} - file is not writable`,
      );
    }
  }
}
