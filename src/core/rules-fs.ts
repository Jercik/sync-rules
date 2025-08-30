import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import { normalizePath, isValidMdFile } from "../utils/paths.ts";
import { ensureError } from "../utils/errors.ts";

/**
 * Finds all paths in the rules directory that match the given glob patterns.
 * Uses globby for efficient pattern matching with support for negation patterns.
 */
export async function globRulePaths(
  rulesDir: string,
  patterns: string[],
): Promise<string[]> {
  const normalizedDir = normalizePath(rulesDir);

  // Filter out empty patterns to prevent glob errors
  const validPatterns = patterns.filter((p) => p && p.trim() !== "");

  // Determine if there is at least one positive (non-negated) pattern
  const hasPositive = validPatterns.some((p) => !p.trim().startsWith("!"));

  // Default to all markdown files if no patterns provided
  // If only negative patterns are provided, start from all markdown and apply exclusions
  const patternsToUse =
    validPatterns.length === 0
      ? ["**/*.md"]
      : hasPositive
        ? validPatterns
        : ["**/*.md", ...validPatterns];

  const paths = await globby(patternsToUse, {
    cwd: normalizedDir,
    unique: true,
    onlyFiles: true,
  });

  return paths.sort();
}

/**
 * Filters an array of relative paths to only include valid Markdown files.
 * Checks extension using isValidMdFile from utils.
 */
export function filterValidMdPaths(paths: string[]): string[] {
  return paths.filter((relPath) => isValidMdFile(relPath));
}

/**
 * Reads the contents of multiple rule files asynchronously.
 * Returns an array of objects containing the relative path and content of each file.
 */
export type Rule = { path: string; content: string };

export async function readRuleContents(
  rulesDir: string,
  relPaths: string[],
): Promise<Rule[]> {
  const normalizedDir = normalizePath(rulesDir);

  const results = await Promise.all(
    relPaths.map(async (relPath) => {
      const fullPath = join(normalizedDir, relPath);
      try {
        const content = await readFile(fullPath, "utf8");
        return { path: relPath, content };
      } catch (error) {
        // Fail explicitly instead of silently skipping
        throw new Error(
          `Failed to read rule file '${fullPath}': ${ensureError(error).message}`,
        );
      }
    }),
  );

  return results;
}

/**
 * Convenience function to load rules from the central repository
 * Combines globRulePaths, filterValidMdPaths, and readRuleContents
 */
export async function loadRulesFromCentral(
  rulesDir: string,
  patterns: string[],
): Promise<Rule[]> {
  const rulePaths = await globRulePaths(rulesDir, patterns);
  const validPaths = filterValidMdPaths(rulePaths);
  return readRuleContents(rulesDir, validPaths);
}
