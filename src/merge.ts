import type { ScanResult, FileInfo } from "./scan.ts";
import * as logger from "./utils/core.ts";
import { normalizePath, createTemporaryFile } from "./utils/core.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { checkGitAvailability, runGitMergeFile } from "./utils/git.ts";
import {
  checkVSCodeAvailability,
  runVSCodeConflictResolution,
} from "./utils/vscode.ts";

/**
 * Defines the types of synchronization actions that can be performed on a file.
 */
type SyncActionType =
  | "COPY_TO_TARGET" // File exists in source, not in target.
  | "MERGE" // File exists in both source and target but has different content.
  | "SKIP_IDENTICAL" // File exists in both and has identical content.
  | "SKIP_TARGET_ONLY" // File exists only in target.
  | "SKIP_LOCAL" // File is marked as local (project-specific) and should not be synced.
  | "ERROR"; // An error occurred related to this file.

/**
 * Represents a planned synchronization operation for a single file.
 */
interface SyncOperation {
  /** The type of action to perform. */
  action: SyncActionType;
  /** Information about the source file, if applicable. */
  sourceFile?: FileInfo;
  /** Information about the target file, if applicable. */
  targetFile?: FileInfo;
  /** The common relative path of the file within the source/target directories. */
  relativePath: string;
  /** An optional message, typically used for "ERROR" actions. */
  message?: string;
}

/**
 * Options for configuring the file merging process.
 */
export interface MergeOptions {
  /** The absolute path to the source directory. */
  sourceDir: string;
  /** The absolute path to the target directory. */
  targetDir: string;
  /** If true, operations will be logged but no actual file changes will be made. */
  dryRun: boolean;
}

/**
 * Compares files found in the source and target directories (from {@link ScanResult})
 * and determines the appropriate synchronization operation for each file.
 *
 * @param scanResult The result object from the `scan` phase, containing maps of source and target files.
 * @returns An array of {@link SyncOperation} objects detailing the actions to be taken.
 */
function determineSyncOperations(scanResult: ScanResult): SyncOperation[] {
  const operations: SyncOperation[] = [];
  const allRelativePaths = new Set([
    ...scanResult.sourceFiles.keys(),
    ...scanResult.targetFiles.keys(),
  ]);
  for (const relativePath of allRelativePaths) {
    const sourceFile = scanResult.sourceFiles.get(relativePath);
    const targetFile = scanResult.targetFiles.get(relativePath);

    // Check if either file is marked as local
    if (sourceFile?.isLocal || targetFile?.isLocal) {
      operations.push({
        action: "SKIP_LOCAL",
        sourceFile,
        targetFile,
        relativePath,
      });
      continue;
    }

    if (sourceFile && targetFile) {
      if (!sourceFile.hash || !targetFile.hash) {
        // If hash is missing for any, assume different and attempt merge/copy
        // This can happen if getFileHash failed for one of them
        logger.warn(`Hash missing for ${relativePath}. Defaulting to MERGE.`);
        operations.push({
          action: "MERGE",
          sourceFile,
          targetFile,
          relativePath,
        });
      } else if (sourceFile.hash === targetFile.hash) {
        operations.push({
          action: "SKIP_IDENTICAL",
          sourceFile,
          targetFile,
          relativePath,
        });
      } else {
        operations.push({
          action: "MERGE",
          sourceFile,
          targetFile,
          relativePath,
        });
      }
    } else if (sourceFile) {
      operations.push({
        action: "COPY_TO_TARGET",
        sourceFile,
        relativePath,
      });
    } else if (targetFile) {
      // File only exists in target. For now, we skip.
      // Future: could be an option to delete from target if not in source.
      operations.push({
        action: "SKIP_TARGET_ONLY",
        targetFile,
        relativePath,
      });
    }
  }
  return operations;
}

/**
 * Executes a file copy operation from a source path to a destination path.
 * If `dryRun` is true, logs the intended action without actually copying.
 * Creates the destination directory if it doesn't exist.
 *
 * @param sourcePath The absolute path to the source file.
 * @param destinationPath The absolute path to the destination where the file should be copied.
 * @param dryRun If true, simulate the copy without actual file system changes.
 * @returns A promise that resolves when the copy is complete or simulated.
 * @throws If an error occurs during file copying (and not in dryRun mode).
 */
async function executeCopy(
  sourcePath: string,
  destinationPath: string,
  dryRun: boolean,
): Promise<void> {
  logger.log(
    `${
      dryRun ? "[DRY RUN] Would copy" : "Copying"
    }: ${sourcePath} -> ${destinationPath}`,
  );
  if (!dryRun) {
    try {
      const destDir = path.dirname(destinationPath);
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
    } catch (error) {
      logger.error(`Error copying ${sourcePath} to ${destinationPath}:`, error);
      throw error; // Re-throw to be caught by processSyncOperations
    }
  }
}

/**
 * Executes a merge operation for a single file that differs between source and target.
 * Uses the VS Code strategy: first tries git merge-file automatically, then opens VS Code only if conflicts occur.
 *
 * @param sourceFile {@link FileInfo} object for the source version of the file.
 * @param targetFile {@link FileInfo} object for the target version of the file.
 * @param options {@link MergeOptions} controlling the merge behavior (dry run).
 * @returns A promise that resolves to `true` if merge conflicts occurred, and `false` otherwise.
 * @throws If Git or VS Code is not available, or if there's an unrecoverable error during execution.
 */
async function executeMerge(
  sourceFile: FileInfo,
  targetFile: FileInfo,
  options: MergeOptions,
): Promise<boolean> {
  logger.log(
    `${options.dryRun ? "[DRY RUN] Would merge" : "Merging"}: ${
      sourceFile.relativePath
    }`,
  );

  if (options.dryRun) {
    return false; // No conflicts in dry run
  }

  const gitAvailable = await checkGitAvailability();
  if (!gitAvailable) {
    logger.error(
      `Git is not available. Cannot perform merge operation for ${sourceFile.relativePath}.`,
    );
    throw new Error(
      `Git not available for merge of ${sourceFile.relativePath}`,
    );
  }

  const vscodeAvailable = await checkVSCodeAvailability();
  if (!vscodeAvailable) {
    logger.error(
      `VS Code CLI is not available. Cannot perform merge operation for ${sourceFile.relativePath}.`,
    );
    throw new Error(
      `VS Code CLI not available for merge of ${sourceFile.relativePath}`,
    );
  }

  const fileExtension = path.extname(sourceFile.relativePath);
  const tempBaseFilePath = await createTemporaryFile(
    "",
    fileExtension || undefined,
  );

  let conflictsOccurred = false;
  try {
    // Step 1: Try automatic merge with git merge-file
    const mergeResult = await runGitMergeFile(
      targetFile.absolutePath,
      sourceFile.absolutePath,
      tempBaseFilePath,
    );

    if (mergeResult.conflicts) {
      // Step 2: If conflicts, open VS Code for resolution
      logger.warn(
        `git merge-file resulted in conflicts for ${sourceFile.relativePath}. ` +
          `Opening VS Code for conflict resolution.`,
      );

      await runVSCodeConflictResolution(targetFile.absolutePath);

      logger.log(
        `VS Code conflict resolution completed for ${targetFile.relativePath}. Please verify the resolved conflicts.`,
      );
      conflictsOccurred = true; // Conflicts were detected and user interaction occurred
    } else {
      logger.log(
        `git merge-file completed successfully for ${sourceFile.relativePath}. No conflicts detected.`,
      );
      conflictsOccurred = false;
    }
  } finally {
    try {
      await fs.unlink(tempBaseFilePath);
    } catch (cleanupError) {
      logger.warn(
        `Failed to clean up temporary base file ${tempBaseFilePath}:`,
        cleanupError,
      );
    }
  }
  return conflictsOccurred;
}

/**
 * Iterates through a list of {@link SyncOperation} objects and executes them.
 * This involves calling `executeCopy` or `executeMerge` as appropriate.
 *
 * @param operations An array of {@link SyncOperation} objects to process.
 * @param options {@link MergeOptions} to pass to the execution functions.
 * @returns A promise that resolves to an object `{ anyConflicts: boolean }`,
 *          where `anyConflicts` is true if any merge operation resulted in conflicts.
 */
async function processSyncOperations(
  operations: SyncOperation[],
  options: MergeOptions,
): Promise<{ anyConflicts: boolean }> {
  let anyConflicts = false;
  for (const op of operations) {
    try {
      switch (op.action) {
        case "COPY_TO_TARGET":
          if (!op.sourceFile) {
            logger.warn(
              `Cannot copy: sourceFile missing for ${op.relativePath}`,
            );
            break;
          }
          try {
            const sourcePath = op.sourceFile.absolutePath;
            const destinationPath = normalizePath(
              path.join(options.targetDir, op.relativePath),
            );
            await executeCopy(sourcePath, destinationPath, options.dryRun);
          } catch (error) {
            logger.error(`Failed to COPY ${op.relativePath}:`, error);
            throw error; // Re-throw critical copy errors
          }
          break;
        case "MERGE":
          if (!op.sourceFile || !op.targetFile) {
            logger.warn(
              `Cannot merge: sourceFile or targetFile missing for ${op.relativePath}`,
            );
            break;
          }
          try {
            const conflictsInFile = await executeMerge(
              op.sourceFile,
              op.targetFile,
              options,
            );
            if (conflictsInFile) {
              anyConflicts = true;
            }
          } catch (error) {
            logger.error(`Failed to MERGE ${op.relativePath}:`, error);
            throw error; // Re-throw critical merge errors (e.g., tool failed to launch)
          }
          break;
        case "SKIP_IDENTICAL":
          logger.log(`Skipping identical file: ${op.relativePath}`);
          break;
        case "SKIP_TARGET_ONLY":
          logger.log(`Skipping target-only file: ${op.relativePath}`);
          break;
        case "SKIP_LOCAL":
          logger.log(`Skipping local file (*.local.*): ${op.relativePath}`);
          break;
        case "ERROR":
          logger.error(
            `Error reported for ${op.relativePath}: ${
              op.message || "No specific message."
            }`,
          );
          // Potentially log more details or handle differently
          break;
        default:
          // This case should ideally not be hit if op.action is strictly SyncActionType
          // but it's good for exhaustiveness checking with string types.
          const exhaustiveCheck: never = op.action; // This will now error if a new SyncActionType is added and not handled
          logger.warn(`Unknown sync action: ${exhaustiveCheck}`);
      }
    } catch (error) {
      logger.error(
        `Failed to process ${op.action} for ${op.relativePath}:`,
        error, // This 'error' is from the outer try-catch, should be specific to the operation
      );
      // If an error was thrown by executeCopy or executeMerge, it's already been re-thrown.
      // This path should ideally not be hit if inner operations re-throw.
      // However, to be safe, if we reach here with an error, treat it as a general failure.
      // For simplicity, we let the re-thrown errors from executeCopy/executeMerge propagate.
      // If an error occurs that wasn't from those (e.g. a logic error here), it will also propagate.
    }
  }
  return { anyConflicts };
}

/**
 * Main orchestrator for the merge phase of the synchronization process.
 * It takes the {@link ScanResult} from the scan phase, determines the necessary
 * synchronization operations (copy, merge, skip), and then processes these operations.
 *
 * @param scanResult The result from the `scan` phase, containing information about
 *                   source and target files and their hashes.
 * @param options {@link MergeOptions} to control the merge behavior, such as dry run
 *                and Git merge strategy.
 * @returns A promise that resolves to an object `{ anyConflicts: boolean }`.
 *          `anyConflicts` will be `true` if any of the merge operations reported
 *          or suspected conflicts, `false` otherwise.
 * @example
 * const scanRes = await scan(scanOpts);
 * const mergeRes = await mergeFiles(scanRes, mergeOpts);
 * if (mergeRes.anyConflicts) {
 *   console.warn("Synchronization finished with conflicts.");
 * } else {
 *   console.log("Synchronization successful.");
 * }
 */
export async function mergeFiles(
  scanResult: ScanResult,
  options: MergeOptions,
): Promise<{ anyConflicts: boolean }> {
  logger.log("Starting merge phase...");
  if (options.dryRun) {
    logger.log("DRY RUN enabled. No actual file changes will be made.");
  }

  const operations = determineSyncOperations(scanResult);
  const result = await processSyncOperations(operations, options);

  logger.log("Merge phase complete.");
  return result;
}
