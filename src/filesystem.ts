/**
 * Filesystem operations for glob pattern matching and rule file filtering.
 * Handles I/O operations and integrates with pure glob logic.
 */

import { glob, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath, isValidMdFile } from "./utils.ts";
import { separatePatterns, filterUniquePaths } from "./globLogic.ts";

/**
 * Finds all paths in the rules directory that match the given glob patterns.
 * Uses native Node.js fs.glob for efficient pattern matching.
 */
export async function globRulePaths(
  rulesDir: string,
  patterns: string[],
): Promise<string[]> {
  const normalizedDir = normalizePath(rulesDir);
  const { positive, negative } = separatePatterns(patterns);

  const iterator = glob(positive, {
    cwd: normalizedDir,
    exclude: negative,
    withFileTypes: false,
  });

  const paths = await Array.fromAsync(iterator);

  return filterUniquePaths(paths);
}

/**
 * Filters an array of relative paths to only include valid Markdown files.
 * Checks file size and extension using isValidMdFile from utils.
 */
export async function filterValidMdPaths(
  rulesDir: string,
  paths: string[],
): Promise<string[]> {
  const normalizedDir = normalizePath(rulesDir);

  const results = await Promise.all(
    paths.map(async (relPath) => {
      const fullPath = join(normalizedDir, relPath);
      try {
        const stats = await stat(fullPath);
        return isValidMdFile(relPath, stats.size) ? relPath : null;
      } catch {
        return null; // Skip on error (e.g., missing file)
      }
    }),
  );

  return results.filter((p): p is string => p !== null);
}

/**
 * Reads the contents of multiple rule files asynchronously.
 * Returns an array of objects containing the relative path and content of each file.
 */
export async function readRuleContents(
  rulesDir: string,
  relPaths: string[],
): Promise<Array<{ path: string; content: string }>> {
  const normalizedDir = normalizePath(rulesDir);

  const results = await Promise.all(
    relPaths.map(async (relPath) => {
      const fullPath = join(normalizedDir, relPath);
      try {
        const content = await readFile(fullPath, "utf8");
        return { path: relPath, content };
      } catch (error) {
        // Log error and skip file if it can't be read
        console.error(`Failed to read file ${fullPath}:`, error);
        return null;
      }
    }),
  );

  // Filter out any failed reads
  return results.filter(
    (r): r is { path: string; content: string } => r !== null,
  );
}
