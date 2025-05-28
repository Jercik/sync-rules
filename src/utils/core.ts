import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { normalize } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

// =============================================================================
// LOGGING UTILITIES
// =============================================================================

let isVerbose = false;

/**
 * Sets the verbosity level for the logger.
 * @param verbose If true, debug messages will be logged.
 */
export function setVerbose(verbose: boolean): void {
  isVerbose = verbose;
}

/**
 * Logs standard messages to the console.
 * @param args Arguments to log.
 */
export function log(...args: unknown[]): void {
  console.log(...args);
}

/**
 * Logs warning messages to the console.
 * @param args Arguments to log as a warning.
 */
export function warn(...args: unknown[]): void {
  console.warn(...args);
}

/**
 * Logs error messages to the console.
 * @param args Arguments to log as an error.
 */
export function error(...args: unknown[]): void {
  console.error(...args);
}

/**
 * Logs debug messages to the console if verbose mode is enabled.
 * @param args Arguments to log as a debug message.
 */
export function debug(...args: unknown[]): void {
  if (isVerbose) {
    console.debug("[DEBUG]", ...args);
  }
}

// =============================================================================
// FILE HASHING UTILITIES
// =============================================================================

/**
 * Computes the SHA-1 hash of a file's content.
 * This is used to determine if files are identical without comparing their full content.
 * Includes file size checking and better error handling for edge cases.
 *
 * @param filePath The absolute path to the file.
 * @returns A promise that resolves to the SHA-1 hash string (hexadecimal).
 * @throws If there's an error reading the file (e.g., file not found, permissions, too large).
 * @example
 * try {
 *   const hash = await getFileHash("/path/to/your/file.txt");
 *   console.log(`File hash: ${hash}`);
 * } catch (error) {
 *   console.error(`Failed to get hash: ${error.message}`);
 * }
 */
export async function getFileHash(filePath: string): Promise<string> {
  debug(`Calculating SHA-1 hash for file: "${filePath}"`);

  try {
    // Check file stats first to handle edge cases
    const stats = await stat(filePath);

    // Check if it's actually a file
    if (!stats.isFile()) {
      throw new Error(`Path is not a regular file: ${filePath}`);
    }

    // Warn about large files (>100MB) but still process them
    const fileSizeBytes = stats.size;
    const maxSizeForWarning = 100 * 1024 * 1024; // 100MB

    if (fileSizeBytes > maxSizeForWarning) {
      warn(
        `Large file detected (${Math.round(
          fileSizeBytes / 1024 / 1024,
        )}MB): ${filePath}. This may take a while...`,
      );
    }

    const fileContent = await readFile(filePath);
    const hash = createHash("sha1");
    hash.update(fileContent);
    const hexHash = hash.digest("hex");
    debug(`SHA-1 for "${filePath}": ${hexHash}`);
    return hexHash;
  } catch (err) {
    // Provide more specific error messages
    if (err instanceof Error) {
      if ("code" in err) {
        switch (err.code) {
          case "ENOENT":
            throw new Error(`File not found: ${filePath}`);
          case "EACCES":
            throw new Error(`Permission denied: ${filePath}`);
          case "EISDIR":
            throw new Error(`Path is a directory, not a file: ${filePath}`);
          case "EMFILE":
          case "ENFILE":
            throw new Error(`Too many open files. Try reducing concurrency.`);
          default:
            throw new Error(`Error reading file "${filePath}": ${err.message}`);
        }
      }
      // Re-throw our custom errors as-is
      throw err;
    }

    // Fallback for non-Error objects
    throw new Error(
      `Unknown error calculating hash for "${filePath}": ${String(err)}`,
    );
  }
}

// =============================================================================
// FILE SYSTEM UTILITIES
// =============================================================================

/**
 * Normalizes a file path to use forward slashes and resolves `.` and `..` segments.
 * This ensures consistent path representation across different operating systems,
 * particularly for operations like glob matching and comparisons.
 *
 * @param filePath The file path to normalize.
 * @returns The normalized path string with forward slashes.
 * @example
 * normalizePath("C:\\Users\\project\\./file.txt"); // "C:/Users/project/file.txt"
 * normalizePath("/usr/local/../bin/script.sh"); // "/usr/bin/script.sh"
 */
export function normalizePath(filePath: string): string {
  const normalized = normalize(filePath).replace(/\\/g, "/");
  debug(`Normalized path: "${filePath}" -> "${normalized}"`);
  return normalized;
}
/**
 * Creates a temporary file with the specified content and optional extension.
 * Useful for creating temporary base files for merge operations or other transient data.
 * The file is created in the system's temporary directory.
 *
 * @param content The string content to write to the temporary file.
 * @param extension Optional file extension (e.g., "txt", "json") for the temporary file.
 *                  This can help tools like mergetools identify the file type.
 * @returns A promise that resolves to the absolute path of the created temporary file.
 * @throws If there is an error creating or writing to the temporary file.
 */
export async function createTemporaryFile(
  content: string,
  extension?: string,
): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `sync-rules-${timestamp}-${random}${
    extension ? `.${extension}` : ""
  }`;
  const tempFilePath = join(tmpdir(), filename);

  debug(
    `Attempting to create temporary file at: ${tempFilePath} with extension: ${
      extension || "none"
    }`,
  );
  await writeFile(tempFilePath, content, "utf-8");
  debug(
    `Successfully created temporary file: ${tempFilePath} with content of length ${content.length}`,
  );
  return tempFilePath;
}
