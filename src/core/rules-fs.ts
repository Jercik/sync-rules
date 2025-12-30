import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import { normalizePath } from "../utils/paths.js";
import { SyncError, ensureError } from "../utils/errors.js";

/**
 * Result of glob matching with tracking of unmatched patterns.
 */
type GlobResult = {
  paths: string[];
  unmatchedPatterns: string[];
};

/**
 * Check if a pattern is a negation pattern (starts with `!`).
 */
function isNegationPattern(pattern: string): boolean {
  return pattern.startsWith("!");
}

/**
 * Find all rule file paths matching the given glob patterns.
 *
 * Uses globby for efficient pattern matching with support for negation patterns.
 * Patterns are validated by Zod before reaching this function.
 *
 * Also tracks which positive patterns matched no files, useful for detecting
 * outdated or misspelled patterns.
 *
 * @param rulesDir - Absolute path to the central rules directory
 * @param patterns - POSIX-style glob patterns (must use forward slashes)
 * @returns Object containing sorted paths and list of unmatched positive patterns
 */
export async function globRulePaths(
  rulesDir: string,
  patterns: string[],
): Promise<GlobResult> {
  const normalizedDir = normalizePath(rulesDir);

  // Trust that patterns have been validated by Zod at ingress
  // globby naturally returns empty array for no matches or only negative patterns
  const paths = await globby(patterns, {
    cwd: normalizedDir,
    unique: true,
    onlyFiles: true,
    followSymbolicLinks: true,
  });

  // Check each positive pattern individually to find unmatched ones
  const positivePatterns = patterns.filter((p) => !isNegationPattern(p));

  // Run each positive pattern individually to check if it matches anything
  const patternResults = await Promise.all(
    positivePatterns.map(async (pattern) => {
      const matches = await globby([pattern], {
        cwd: normalizedDir,
        unique: true,
        onlyFiles: true,
        followSymbolicLinks: true,
      });
      return matches.length === 0 ? pattern : null;
    }),
  );

  const unmatchedPatterns = patternResults
    .filter((p): p is string => p !== null)
    .sort();

  return {
    paths: paths.sort(),
    unmatchedPatterns,
  };
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
 * Result of loading rules with tracking of unmatched patterns.
 */
type LoadRulesResult = {
  rules: Rule[];
  unmatchedPatterns: string[];
};

/**
 * Load all rules matching the given patterns.
 *
 * Convenience function combining glob matching and file reading.
 * Also reports which patterns didn't match any files.
 *
 * @param rulesDir - Absolute path to the central rules directory
 * @param patterns - POSIX-style glob patterns for selecting rules
 * @returns Object containing loaded rules and list of unmatched patterns
 */
export async function loadRules(
  rulesDir: string,
  patterns: string[],
): Promise<LoadRulesResult> {
  const { paths, unmatchedPatterns } = await globRulePaths(rulesDir, patterns);
  const rules = await readRuleContents(rulesDir, paths);
  return { rules, unmatchedPatterns };
}
