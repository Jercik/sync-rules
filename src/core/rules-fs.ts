import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import { normalizePath } from "../utils/paths.js";
import { ensureError } from "../utils/errors.js";

/**
 * Finds all paths in the rules directory that match the given glob patterns.
 * Uses globby for efficient pattern matching with support for negation patterns.
 *
 * Note: Glob patterns must use POSIX-style slashes (/).
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
  });

  return paths.sort();
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
      // Use regular join for file system operations (not glob patterns)
      const fullPath = join(normalizedDir, relPath);
      try {
        const content = await readFile(fullPath, "utf8");
        return { path: relPath, content };
      } catch (error) {
        // Fail explicitly instead of silently skipping
        const err = ensureError(error);
        throw new Error(
          `Failed to read rule file '${fullPath}': ${err.message}`,
          { cause: err },
        );
      }
    }),
  );

  return results;
}

export async function loadRules(
  rulesDir: string,
  patterns: string[],
): Promise<Rule[]> {
  const rulePaths = await globRulePaths(rulesDir, patterns);
  return readRuleContents(rulesDir, rulePaths);
}
