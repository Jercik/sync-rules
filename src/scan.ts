import fg from "fast-glob";
import path from "node:path";
import { promises as fs } from "node:fs";
import * as logger from "./utils/core.ts";
import { getFileHash, normalizePath, generateEffectiveMdPatterns, isGlobPattern, filterMdFiles } from "./utils/core.ts";

/**
 * Represents information about a single file found during a scan.
 */
export interface FileInfo {
  /** Path relative to the scanned base directory (e.g., "rules/myRule.json" or ".clinerules/config.yaml"). */
  relativePath: string;
  /** The absolute path to the file on the filesystem. */
  absolutePath: string;
  /** The SHA-256 hash of the file's content. Undefined if hashing failed or was not performed. */
  hash?: string;
  /** Indicates if this file is project-specific (local) and should not be synced. */
  isLocal?: boolean;
}

/**
 * Options for configuring the directory scanning process.
 */
export interface ScanOptions {
  /** The absolute path to the project directory to scan. */
  projectDir: string;
  /**
   * An array of glob patterns or literal directory/file names to identify rule files.
   * These patterns are applied within both the source and target directories.
   * For literal names (not containing glob characters), both the name itself and
   * a recursive pattern (e.g., `name/**\/*`) will be used.
   * @example [".clinerules", ".cursorrules", "project-rules/*.json"]
   */
  rulePatterns: string[];
  /**
   * An array of patterns to exclude from scanning.
   * These can be literal directory/file names or glob patterns.
   * @example ["memory-bank", "node_modules", ".git", "*.tmp"]
   */
  excludePatterns: string[];
  /** Optional project name for logging purposes. */
  projectName?: string;
}

/**
 * Checks if a file path matches the local pattern (*.local.*).
 * Local files are project-specific and should not be synced.
 *
 * @param filePath The file path to check (can be absolute or relative).
 * @returns true if the file matches the local pattern, false otherwise.
 */
function isLocalFile(filePath: string): boolean {
  // Get just the filename from the path
  const filename = path.basename(filePath);
  // Check if filename matches *.local.* pattern
  return /\.local\./.test(filename);
}

/**
 * Normalizes simple glob patterns to make them recursive if they appear to be basename-only globs.
 * Patterns with path separators (/) or non-simple globs are left unchanged.
 *
 * @param pattern The glob pattern to normalize.
 * @returns The normalized pattern.
 */
function normalizeGlob(pattern: string): string {
  // If pattern has no path separator and is a simple glob (e.g., "*.txt" or "temp.*"), make it recursive
  if (
    !pattern.includes("/") &&
    (pattern.startsWith("*.") || pattern.includes(".*"))
  ) {
    return "**/" + pattern;
  }
  return pattern;
}

/**
 * Scans a single base directory for .md files matching the provided patterns.
 *
 * @param baseDir The absolute path to the directory to scan.
 * @param patterns An array of glob patterns or literal names.
 *                 All patterns are constrained to only match .md files.
 *                 If a pattern is a literal directory name (e.g., ".clinerules"), it will
 *                 search for .md files within it recursively.
 * @param excludePatterns An array of patterns to exclude from scanning.
 * @returns A promise that resolves to a Map of {@link FileInfo} objects, keyed by their `relativePath` from `baseDir`.
 */
async function scanDirectory(
  baseDir: string,
  patterns: string[],
  excludePatterns: string[] = [],
): Promise<Map<string, FileInfo>> {
  const filesMap = new Map<string, FileInfo>();
  const normalizedBaseDir = normalizePath(baseDir);

  // Check if any patterns are non-.md patterns
  const hasNonMdPatterns = patterns.some(p => {
    if (p.endsWith(".md")) return false;
    if (!p.includes("*") && !p.includes("/")) {
      // Could be a directory, will check during processing
      return false;
    }
    // Glob pattern that doesn't end with .md
    return true;
  });
  
  if (hasNonMdPatterns) {
    logger.log("Note: Only .md files are processed. Non-.md patterns will be ignored.");
  }

  // Transform user-provided patterns into globs
  // Global .md constraint: ensure all patterns only match .md files
  let effectiveGlobPatterns = await generateEffectiveMdPatterns(patterns, normalizedBaseDir);
  // Normalize simple globs to be recursive
  effectiveGlobPatterns = effectiveGlobPatterns.map(normalizeGlob);

  // Process exclusion patterns for fast-glob
  // Convert literal names to glob patterns and normalize paths
  let processedExcludePatterns = excludePatterns.flatMap((pattern) => {
    if (isGlobPattern(pattern)) {
      return [normalizeGlob(pattern)]; // Normalize simple globs
    } else {
      // For literal names, create patterns to exclude the directory and its contents
      // We need to create patterns that match against the relative paths that fast-glob will find
      return [
        `**/${pattern}`, // Exclude the literal name anywhere in the tree
        `**/${pattern}/**/*`, // Exclude everything inside it anywhere in the tree
        pattern, // Also exclude if it appears at the root level
        path.join(pattern, "**/*"), // Exclude everything inside it at root level (no normalize needed for patterns)
      ];
    }
  });

  // fast-glob will search these patterns relative to `normalizedBaseDir`
  const relativeEntries = await fg(effectiveGlobPatterns, {
    cwd: normalizedBaseDir, // Search within the base directory
    dot: true, // Match dotfiles
    onlyFiles: true, // We are interested in files for hashing
    absolute: false, // Get paths relative to cwd (normalizedBaseDir)
    stats: false, // Not using stats for now
    followSymbolicLinks: false, // Skip symbolic links to avoid issues
    ignore: processedExcludePatterns, // Exclude patterns
    deep: Infinity, // Ensure deep scanning (default is Infinity, but explicit)
  });

  // Apply post-processing filter to ensure only .md files are processed
  // This is a safety net in case any non-.md files slip through the pattern transformation
  const mdFiles = filterMdFiles(relativeEntries);
  
  if (relativeEntries.length > mdFiles.length) {
    const nonMdCount = relativeEntries.length - mdFiles.length;
    logger.debug(`Filtered out ${nonMdCount} non-.md file(s) from glob results`);
  }

  for (const relativePath of mdFiles) {
    // Keep relative path as-is from fast-glob (already in POSIX format)
    // We don't normalize relative paths as that would make them absolute
    const absolutePath = path.join(normalizedBaseDir, relativePath);
    const fileInfo: FileInfo = {
      relativePath: relativePath,
      absolutePath: normalizePath(absolutePath),
      isLocal: isLocalFile(relativePath),
    };
    filesMap.set(relativePath, fileInfo);
  }
  return filesMap;
}

/**
 * Scans a project directory for rule files based on specified patterns,
 * and calculates SHA-256 hashes for each found file.
 *
 * The function first uses `fast-glob` to find all files matching the `rulePatterns`
 * within the project directory. It then calculates the SHA-256 hash for
 * each file found.
 *
 * @param options An object of type {@link ScanOptions} defining the project directory
 *                and the rule patterns to search for.
 * @returns A promise that resolves to a Map where keys are relative file paths
 *          and values are {@link FileInfo} objects (including hashes).
 * @throws If there's an unrecoverable error during directory scanning.
 *         Errors during individual file hashing are logged as warnings, and the `hash` property
 *         for that file will be `undefined` in the result.
 */
export async function scan(
  options: ScanOptions,
): Promise<Map<string, FileInfo>> {
  const projectLabel = options.projectName
    ? ` for project '${options.projectName}'`
    : "";
  logger.log(`Starting scan phase${projectLabel}...`);

  const { projectDir, rulePatterns, excludePatterns } = options;

  let files: Map<string, FileInfo>;

  try {
    // Scan the project directory
    files = await scanDirectory(projectDir, rulePatterns, excludePatterns);
  } catch (error) {
    logger.error(
      `Error during directory scanning${projectLabel}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }

  // Calculate hashes serially for simplicity
  const filesToRemove: string[] = [];
  for (const [relativePath, fileInfo] of files.entries()) {
    try {
      fileInfo.hash = await getFileHash(fileInfo.absolutePath);
    } catch (error) {
      // Check if it's a file size error (too large)
      if (error instanceof Error && error.message.includes("Rule files should be under 1MB")) {
        logger.warn(
          `Skipping large file: ${fileInfo.absolutePath} - ${error.message}`,
        );
        filesToRemove.push(relativePath);
      } else {
        // Log other errors but continue; file without hash will be handled later
        logger.warn(
          `Could not calculate hash for ${fileInfo.absolutePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Ensure hash is undefined if calculation fails
        fileInfo.hash = undefined;
      }
    }
  }
  
  // Remove files that are too large
  for (const path of filesToRemove) {
    files.delete(path);
  }
  logger.log(
    `Scan and hash calculation complete${projectLabel}. Found ${files.size} rule files.`,
  );

  return files;
}
