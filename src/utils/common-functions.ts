import * as logger from "./core.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";

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
 * Formats Zod validation errors in a consistent way.
 * 
 * @param error The Zod error to format
 * @returns Formatted error messages as an array of strings
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Logs Zod validation errors in a consistent format.
 * 
 * @param error The Zod error to log
 * @param prefix Optional prefix for the error messages
 */
export function logZodErrors(error: z.ZodError, prefix?: string): void {
  const errors = formatZodErrors(error);
  errors.forEach(err => {
    if (prefix) {
      logger.error(`${prefix} - ${err}`);
    } else {
      logger.error(`  - ${err}`);
    }
  });
}