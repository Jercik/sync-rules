import { homedir } from "node:os";
import { resolve, basename } from "node:path";

/**
 * Normalize a path by expanding `~` and resolving to an absolute path.
 * No boundary or permission checks are performed here.
 * Use PathGuard at execution time to enforce allowed roots.
 * @param input - The path to normalize (supports ~ for home directory)
 * @returns The normalized absolute path
 */
export function normalizePath(input: string): string {
  if (!input || input.trim() === "") {
    return resolve(input || ".");
  }
  const expanded = input.startsWith("~")
    ? input.replace(/^~/, homedir())
    : input;
  return resolve(expanded);
}

/**
 * Checks if a file is a valid markdown file
 * @param path - The file path to check
 * @returns true if valid markdown file, false otherwise
 */
export function isValidMdFile(path: string): boolean {
  // Use basename to handle edge cases like /directory/.md correctly
  const filename = basename(path).toLowerCase();
  // Check markdown extension and ensure it has a filename before .md
  return filename.endsWith(".md") && filename !== ".md";
}
