import * as logger from "./core.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SyncAction } from "../multi-sync.ts";

/**
 * Logs a dry-run action in a consistent format.
 * 
 * @param action The action that would be performed (e.g., "add", "update", "delete")
 * @param details Additional details about the action
 * @param dryRun Whether this is a dry-run
 */
export function logDryRunAction(action: string, details: string, dryRun: boolean): void {
  if (dryRun) {
    logger.log(`[DRY RUN] Would ${action}: ${details}`);
  } else {
    logger.log(`${action}: ${details}`);
  }
}

/**
 * Ensures a file path exists by creating parent directories if needed.
 * 
 * @param filePath The full file path
 * @param dryRun Whether this is a dry-run (if true, only checks but doesn't create)
 * @returns The directory path
 */
export async function ensureFilePath(filePath: string, dryRun: boolean): Promise<string> {
  const dirPath = path.dirname(filePath);
  
  if (!dryRun) {
    await fs.mkdir(dirPath, { recursive: true });
  }
  
  return dirPath;
}

/**
 * Handles file system errors in a consistent way.
 * 
 * @param err The error to handle
 * @param context Context about where the error occurred
 * @param filePath Optional file path related to the error
 */
export function handleFsError(err: unknown, context: string, filePath?: string): void {
  if (err instanceof Error && "code" in err) {
    const fsErr = err as NodeJS.ErrnoException;
    const fileInfo = filePath ? ` for "${filePath}"` : "";
    
    switch (fsErr.code) {
      case "ENOENT":
        logger.error(`${context}: File not found${fileInfo}`);
        break;
      case "EACCES":
        logger.error(`${context}: Permission denied${fileInfo}`);
        break;
      case "EISDIR":
        logger.error(`${context}: Path is a directory${fileInfo}`);
        break;
      case "EMFILE":
        logger.error(`${context}: Too many open files`);
        break;
      case "ENOSPC":
        logger.error(`${context}: No space left on device`);
        break;
      default:
        logger.error(`${context}: ${fsErr.message}${fileInfo}`);
    }
  } else {
    logger.error(`${context}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Logs a standardized sync summary with counts and totals.
 * 
 * @param title The title for the summary (e.g., "Planned Changes Summary", "Synchronization Summary")
 * @param totalActions Total number of actions planned or executed
 * @param updates Number of update actions
 * @param additions Number of addition actions  
 * @param deletions Number of deletion actions
 * @param skips Optional number of skipped actions (for execution summaries)
 * @param errors Optional number of errors (for execution summaries)
 */
export function logSyncSummary(
  title: string,
  totalActions: number,
  updates: number,
  additions: number,
  deletions: number,
  skips?: number,
  errors?: number
): void {
  logger.log(`\n=== ${title} ===`);
  logger.log(`Total actions: ${totalActions}`);
  logger.log(`Updates: ${updates}`);
  logger.log(`Additions: ${additions}`);
  logger.log(`Deletions: ${deletions}`);
  
  if (skips !== undefined) {
    logger.log(`Skipped: ${skips}`);
  }
  
  if (errors !== undefined && errors > 0) {
    logger.warn(
      `\n⚠️  Synchronization complete with ${errors} errors detected.`,
    );
    logger.warn("Please review the affected files and resolve any issues.");
  } else if (errors !== undefined) {
    logger.log("\n✅ Synchronization completed successfully!");
  }
}

/**
 * Calculates action counts from a list of sync actions.
 * 
 * @param syncActions Array of sync actions to count
 * @returns Object containing counts for each action type
 */
export function calculateActionCounts(syncActions: SyncAction[]): {
  updates: number;
  additions: number;
  deletions: number;
} {
  return {
    updates: syncActions.filter((a) => a.type === "update").length,
    additions: syncActions.filter((a) => a.type === "add").length,
    deletions: syncActions.filter((a) => a.type === "delete").length,
  };
}

