import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import { normalizePath } from "../utils/paths.js";
import { SyncError, ensureError } from "../utils/errors.js";

/**
 * Find all rule file paths matching the given glob patterns.
 *
 * Uses globby for efficient pattern matching with support for negation patterns.
 * Patterns are validated by Zod before reaching this function.
 *
 * @param rulesDir - Absolute path to the central rules directory
 * @param patterns - POSIX-style glob patterns (must use forward slashes)
 * @returns Sorted array of relative paths matching the patterns
 */
export async function globRulePaths(
  rulesDir: string,
  patterns: string[],
): Promise<string[]> {
  const normalizedDir = normalizePath(rulesDir);

  // Trust that patterns have been validated by Zod at ingress
  // globby naturally returns empty array for no matches or only negative patterns
  const paths = await globby(patterns, {
    cwd: normalizedDir,
    unique: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  return paths.sort();
}

/**
 * Represents a loaded rule file with its path and content.
 */
export type Rule = { path: string; content: string };

/**
 * Read contents of multiple rule files concurrently.
 *
 * @param rulesDir - Absolute path to the central rules directory
 * @param relPaths - Array of relative paths to read (from globRulePaths)
 * @returns Array of Rule objects containing path and content
 * @throws {SyncError} If any file cannot be read
 */

export async function readRuleContents(
  rulesDir: string,
  relPaths: string[],
): Promise<Rule[]> {
  const normalizedDir = normalizePath(rulesDir);

  const results = await Promise.all(
    relPaths.map(async (relPath) => {
      // Use regular join for file system operations (not glob patterns)
      const fullPath = join(normalizedDir, relPath);
      try {
        const content = await readFile(fullPath, "utf8");
        return { path: relPath, content };
      } catch (error) {
        // Fail explicitly instead of silently skipping
        const err = ensureError(error);
        throw new SyncError(
          `Failed to read rule file '${fullPath}': ${err.message}`,
          { action: "read", path: fullPath },
          err,
        );
      }
    }),
  );

  return results;
}

/**
 * Load all rules matching the given patterns.
 *
 * Convenience function combining glob matching and file reading.
 *
 * @param rulesDir - Absolute path to the central rules directory
 * @param patterns - POSIX-style glob patterns for selecting rules
 * @returns Array of loaded rules with path and content
 */
export async function loadRules(
  rulesDir: string,
  patterns: string[],
): Promise<Rule[]> {
  const rulePaths = await globRulePaths(rulesDir, patterns);
  return readRuleContents(rulesDir, rulePaths);
}
