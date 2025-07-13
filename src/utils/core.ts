import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

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
// PATTERN TRANSFORMATION UTILITIES
// =============================================================================

/**
 * Checks if a pattern string contains glob characters.
 * @param pattern The pattern to check.
 * @returns True if the pattern contains glob characters.
 */
export function isGlobPattern(pattern: string): boolean {
  return /[*?[\]{}!]/.test(pattern);
}

/**
 * Transforms user-provided patterns into effective .md-only patterns.
 * This ensures that all patterns only match .md files, maintaining
 * consistency across the system.
 * 
 * @param rulePatterns The original patterns from the user.
 * @param baseDir Optional base directory to check if literal patterns are directories.
 * @returns A promise that resolves to an array of .md-specific glob patterns.
 */
export async function generateEffectiveMdPatterns(
  rulePatterns: string[],
  baseDir?: string,
): Promise<string[]> {
  const { stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  
  const globPromises = rulePatterns.map(async (pattern) => {
    if (isGlobPattern(pattern)) {
      // For existing glob patterns, ensure they target .md files
      if (pattern.endsWith(".md")) {
        return [pattern]; // Already targets .md files
      } else if (pattern.endsWith("/*") || pattern.endsWith("/**/*")) {
        // Replace wildcard endings with .md-specific patterns
        const base = pattern.replace(/\/\*+$/, "");
        return [`${base}/*.md`, `${base}/**/*.md`];
      } else if (pattern === "*" || pattern === "**") {
        // Special case for root-level wildcards
        return ["*.md", "**/*.md"];
      } else if (!pattern.includes("/")) {
        // Pattern without path separator - could match root-level files
        if (pattern.endsWith("*")) {
          // Pattern like "copy*" should match "copy*.md" at root level
          return [`${pattern}.md`, `${pattern}/*.md`, `${pattern}/**/*.md`];
        } else {
          // Pattern like "rules" should check both file and directory
          return [`${pattern}.md`, `${pattern}/*.md`, `${pattern}/**/*.md`];
        }
      } else {
        // Pattern with path separator - append *.md for directories
        return [`${pattern}/*.md`, `${pattern}/**/*.md`];
      }
    }
    
    // For literal names, check if it's a directory if baseDir is provided
    if (baseDir) {
      try {
        const stats = await stat(join(baseDir, pattern));
        if (stats.isDirectory()) {
          return [`${pattern}/*.md`, `${pattern}/**/*.md`];
        }
      } catch {
        // Path doesn't exist or other stat error. Treat as a file pattern.
      }
    }
    
    // For files, only include if it ends with .md
    if (pattern.endsWith(".md")) {
      return [pattern];
    }
    
    // Non-.md file or unknown - might be a directory
    // Return patterns that would match if it's a directory
    return [`${pattern}/*.md`, `${pattern}/**/*.md`];
  });
  
  return (await Promise.all(globPromises)).flat();
}

/**
 * Filters an array of file paths to only include .md files.
 * This is used as a post-processing step after glob expansion
 * to ensure no non-.md files slip through.
 * 
 * @param files Array of file paths to filter.
 * @returns Array containing only paths that end with .md.
 */
export function filterMdFiles(files: string[]): string[] {
  return files.filter(file => file.endsWith(".md"));
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
  // Use resolve to handle .., ., and platform-specific separators
  const resolvedPath = resolve(filePath);
  // Replace backslashes with forward slashes for consistency
  const normalized = resolvedPath.replace(/\\/g, "/");
  debug(`Normalized path: "${filePath}" -> "${normalized}"`);
  return normalized;
}

/**
 * Validates that a path is within the allowed base directory to prevent path traversal attacks.
 * This function ensures that user-provided paths cannot escape the intended directory boundaries.
 *
 * @param userPath The user-provided path to validate.
 * @param baseDir The base directory that the path must be within.
 * @returns The validated absolute path.
 * @throws Error if the path attempts to escape the base directory.
 * @example
 * validatePathSecurity("../../../etc/passwd", "/home/user/projects"); // Throws error
 * validatePathSecurity("./project1", "/home/user/projects"); // Returns "/home/user/projects/project1"
 * validatePathSecurity("%2e%2e%2f%2e%2e%2fetc", "/home/user/projects"); // Throws error (URL-encoded)
 */
export function validatePathSecurity(userPath: string, baseDir: string): string {
  // Decode URL-encoded paths to catch encoded traversal attempts
  // Handle multiple levels of encoding (e.g., %252e = %2e = .)
  let decodedPath = userPath;
  let previousPath = "";
  
  // Keep decoding until the path doesn't change or we hit an error
  while (decodedPath !== previousPath) {
    previousPath = decodedPath;
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // If decoding fails, stop and use what we have
      break;
    }
  }
  
  // Resolve both paths to absolute form
  const resolvedBase = resolve(baseDir);
  const resolvedUser = resolve(baseDir, decodedPath);
  
  // Normalize for consistent comparison
  const normalizedBase = normalizePath(resolvedBase);
  const normalizedUser = normalizePath(resolvedUser);
  
  // Add trailing slash to base for proper prefix matching
  const normalizedBaseWithSlash = normalizedBase.endsWith('/')
    ? normalizedBase
    : normalizedBase + '/';
  
  // Check if user path is the base directory itself
  if (normalizedUser === normalizedBase) {
    // This is OK only for ".", "", or the base dir itself
    if (userPath === "." || userPath === "" || normalizePath(resolve(userPath)) === normalizedBase) {
      return normalizedUser;
    }
    // Otherwise it's a traversal that ended up at base
    throw new Error(
      `Invalid path: "${userPath}" resolves to the base directory itself`
    );
  }
  
  // Ensure the resolved user path starts with the base directory
  if (!normalizedUser.startsWith(normalizedBaseWithSlash)) {
    throw new Error(
      `Path traversal attempt detected: "${userPath}" would resolve outside of base directory "${baseDir}"`
    );
  }
  
  return normalizedUser;
}
