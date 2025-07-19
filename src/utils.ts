import { resolve, normalize } from "path";
import { homedir } from "os";

/**
 * File system action types for testability
 */
export type FSAction =
  | { type: "write"; path: string; content: string }
  | { type: "mkdir"; path: string; recursive?: boolean }
  | { type: "copy"; from: string; to: string };

/**
 * Normalizes and validates a file path, preventing directory traversal attacks
 * @param input - The path to normalize (supports ~ for home directory)
 * @returns The normalized absolute path
 * @throws Error if path contains traversal attempts or is outside allowed directories
 */
export function normalizePath(input: string): string {
  if (!input || input.trim() === "") {
    throw new Error("Invalid path: empty string");
  }

  // Expand home directory
  let expandedPath = input;
  if (input.startsWith("~")) {
    expandedPath = input.replace(/^~/, homedir());
  }

  // Check if path contains .. before resolving
  if (input.includes("..")) {
    throw new Error("Path traversal detected");
  }

  // Resolve to absolute path
  const absolutePath = resolve(expandedPath);
  const normalizedPath = normalize(absolutePath);

  // Define allowed root directories
  const home = homedir();
  const centralRepo = resolve(home, "Developer/agent-rules");

  // Check if path is within allowed directories
  const isInHome = normalizedPath.startsWith(home);
  const isInCentral = normalizedPath.startsWith(centralRepo);
  const isInCwd = normalizedPath.startsWith(process.cwd());

  if (!isInHome && !isInCentral && !isInCwd) {
    throw new Error("Path is outside allowed directories");
  }

  return normalizedPath;
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

  // Check size limit (1MB = 1024 * 1024 bytes)
  if (size >= 1024 * 1024) {
    return false;
  }

  // Check markdown extension (case sensitive)
  return path.endsWith(".md");
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
