/**
 * Pure functions for processing glob patterns and filtering paths.
 * No filesystem operations - only string manipulation and filtering.
 */

/**
 * Result of separating glob patterns into positive and negative patterns.
 */
export interface PatternSeparationResult {
  /** Patterns that include files (e.g., "*.md", "frontend/**") */
  readonly positive: string[];
  /** Patterns that exclude files (e.g., "test/**", "*.tmp") - without the leading "!" */
  readonly negative: string[];
}

/**
 * Separates glob patterns into positive and negative (exclusion) patterns.
 * Negative patterns start with '!'. Empty patterns are filtered out to prevent
 * glob errors. If no positive patterns are provided, defaults to matching all
 * Markdown files since we only want Markdown files.
 */
export function separatePatterns(patterns: string[]): PatternSeparationResult {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const pattern of patterns) {
    if (!pattern || pattern.trim() === "") {
      continue; // Skip empty patterns
    }

    if (pattern.startsWith("!")) {
      const negativePattern = pattern.slice(1);
      if (negativePattern && negativePattern.trim() !== "") {
        negative.push(negativePattern);
      }
    } else {
      positive.push(pattern);
    }
  }

  return {
    positive: positive.length > 0 ? positive : ["**/*.md"],
    negative,
  };
}

/**
 * Filters an array of paths to remove duplicates and sorts them alphabetically
 * for deterministic results.
 */
export function filterUniquePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}
