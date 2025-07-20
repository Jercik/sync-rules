import { resolve, normalize, relative, isAbsolute } from "path";
import { homedir } from "os";
import { realpathSync } from "fs";
import { MAX_MD_SIZE, getAllowedRoots } from "./constants.ts";

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

  // Resolve to absolute path first (allows .. in safe paths like ~/projects/../my-safe-dir)
  const absolutePath = resolve(expandedPath);
  const normalizedPath = normalize(absolutePath);

  // Resolve symlinks to prevent bypass attempts
  let realPath: string;
  try {
    realPath = realpathSync(normalizedPath);
  } catch {
    // If path doesn't exist yet, use the normalized path
    // This allows creating new files/directories
    realPath = normalizedPath;
  }

  // Check if path is within allowed directories using relative path method
  const allowedRoots = getAllowedRoots();
  const isAllowed = allowedRoots.some((root) => {
    const relativePath = relative(root, realPath);
    // Path is inside root if relative path doesn't start with .. or /
    // and isn't an absolute path
    return (
      !relativePath.startsWith("..") &&
      !relativePath.startsWith("/") &&
      !isAbsolute(relativePath)
    );
  });

  if (!isAllowed) {
    throw new Error("Path is outside allowed directories");
  }

  return realPath;
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
