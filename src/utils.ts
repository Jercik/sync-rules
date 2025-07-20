import { MAX_MD_SIZE } from "./constants.ts";
import { createDefaultPathGuard } from "./pathGuard.ts";

/**
 * File system action types for testability
 */
export type FSAction =
  | { type: "write"; path: string; content: string }
  | { type: "mkdir"; path: string; recursive?: boolean }
  | { type: "copy"; from: string; to: string };

// Create a singleton instance of PathGuard with default allowed roots
const defaultPathGuard = createDefaultPathGuard();

/**
 * Normalizes and validates a file path, preventing directory traversal attacks
 *
 * SECURITY NOTE: This function is critical for preventing path traversal attacks.
 * All file system operations in adapters MUST use this function to normalize paths
 * before writing or creating directories. This ensures that malicious input cannot
 * escape the intended project directory.
 *
 * @param input - The path to normalize (supports ~ for home directory)
 * @returns The normalized absolute path
 * @throws Error if path contains traversal attempts or is outside allowed directories
 */
export function normalizePath(input: string): string {
  return defaultPathGuard.validatePath(input);
}

/**
 * Checks if a file is a valid markdown file under 1MB
 * @param path - The file path to check
 * @param size - The file size in bytes
 * @returns true if valid markdown file under 1MB, false otherwise
 */
export function isValidMdFile(path: string, size: number): boolean {
  // Check for negative size
  if (size < 0) {
    return false;
  }

  // Check size limit
  if (size >= MAX_MD_SIZE) {
    return false;
  }

  // Check markdown extension (case insensitive)
  const lowerCasePath = path.toLowerCase();
  return lowerCasePath.endsWith(".md") && lowerCasePath.length > 3;
}

/**
 * Logs a message to console if verbose mode is enabled
 * @param message - The message to log
 * @param isVerbose - Whether verbose mode is enabled
 */
export function logMessage(message: string, isVerbose: boolean): void {
  if (isVerbose) {
    console.log(message);
  }
}
