import fg from "fast-glob";
import path from "node:path";
import * as logger from "./utils/core.ts";
import { getFileHash, normalizePath } from "./utils/core.ts";

/**
 * Represents information about a single file found during a scan.
 */
export interface FileInfo {
  /** Path relative to the scanned base directory (e.g., "rules/myRule.json" or ".clinerules/config.yaml"). */
  relativePath: string;
  /** The absolute path to the file on the filesystem. */
  absolutePath: string;
  /** The SHA-1 hash of the file's content. Undefined if hashing failed or was not performed. */
  hash?: string;
}

/**
 * Contains the results of scanning both source and target directories.
 * Files are mapped by their relative paths for easy comparison.
 */
export interface ScanResult {
  /** A map of {@link FileInfo} objects found in the source directory, keyed by their `relativePath`. */
  sourceFiles: Map<string, FileInfo>;
  /** A map of {@link FileInfo} objects found in the target directory, keyed by their `relativePath`. */
  targetFiles: Map<string, FileInfo>;
}

/**
 * Options for configuring the directory scanning process.
 */
export interface ScanOptions {
  /** The absolute path to the source directory. */
  sourceDir: string;
  /** The absolute path to the target directory. */
  targetDir: string;
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
}

/**
 * Scans a single base directory for files matching the provided patterns.
 *
 * @param baseDir The absolute path to the directory to scan.
 * @param patterns An array of glob patterns or literal names.
 *                 If a pattern is a literal name (e.g., ".clinerules"), it will be treated as
 *                 both the literal name and a recursive glob (e.g., ".clinerules/** /*").
 *                 Existing glob patterns are used as-is.
 * @returns A promise that resolves to a Map of {@link FileInfo} objects, keyed by their `relativePath` from `baseDir`.
 */
async function scanDirectory(
  baseDir: string,
  patterns: string[],
  excludePatterns: string[] = [],
): Promise<Map<string, FileInfo>> {
  const filesMap = new Map<string, FileInfo>();
  const normalizedBaseDir = normalizePath(baseDir);

  // Helper to check if a pattern string contains glob characters
  const isGlobPattern = (pattern: string): boolean =>
    /[*?[\]{}!]/.test(pattern);

  // Transform user-provided patterns
  // For non-glob literals, create two variants: original and recursive (e.g., dirName and dirName/**/*)
  // For existing globs, use them as is.
  const effectiveGlobPatterns = patterns.flatMap(
    (p) =>
      isGlobPattern(p)
        ? [p] // Use existing glob as is
        : [p, normalizePath(path.join(p, "**/*"))], // Create literal and recursive variant
  );

  // Process exclusion patterns for fast-glob
  // Convert literal names to glob patterns and normalize paths
  const processedExcludePatterns = excludePatterns.flatMap((pattern) => {
    if (isGlobPattern(pattern)) {
      return [pattern]; // Use glob patterns as-is
    } else {
      // For literal names, create patterns to exclude the directory and its contents
      // We need to create patterns that match against the relative paths that fast-glob will find
      return [
        `**/${pattern}`, // Exclude the literal name anywhere in the tree
        `**/${pattern}/**/*`, // Exclude everything inside it anywhere in the tree
        pattern, // Also exclude if it appears at the root level
        normalizePath(path.join(pattern, "**/*")), // Exclude everything inside it at root level
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
  });

  for (const relativePath of relativeEntries) {
    // Ensure relativePath is normalized (though fg usually returns POSIX paths)
    const normalizedRelativePath = normalizePath(relativePath);
    const absolutePath = normalizePath(
      path.join(normalizedBaseDir, normalizedRelativePath),
    );
    const fileInfo: FileInfo = {
      relativePath: normalizedRelativePath,
      absolutePath,
    };
    filesMap.set(normalizedRelativePath, fileInfo);
  }
  return filesMap;
}

/**
 * Scans source and target directories for rule files based on specified patterns,
 * and calculates SHA-1 hashes for each found file.
 *
 * The function first uses `fast-glob` to find all files matching the `rulePatterns`
 * within both `sourceDir` and `targetDir`. It then calculates the SHA-1 hash for
 * each unique file found across both directories concurrently, respecting a concurrency limit.
 *
 * @param options An object of type {@link ScanOptions} defining the source and target directories,
 *                and the rule patterns to search for.
 * @returns A promise that resolves to a {@link ScanResult} object. This object contains
 *          two maps (`sourceFiles` and `targetFiles`), where each map's keys are
 *          relative file paths and values are {@link FileInfo} objects (including hashes).
 * @throws If there's an unrecoverable error during directory scanning (though `fast-glob` is generally robust).
 *         Errors during individual file hashing are logged as warnings, and the `hash` property
 *         for that file will be `undefined` in the result.
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  logger.log("Starting scan phase...");

  const { sourceDir, targetDir, rulePatterns, excludePatterns } = options;

  // Scan source and target directories
  // For now, we assume rulePatterns are relative to the source/target dir itself.
  // A more complex setup might involve scanning specific subdirectories like ".clinerules"
  // and then applying further patterns within those. The current `rulePatterns` from CLI
  // are like `['.clinerules', '.cursorrules', 'rules/*/_*.json']`
  // These should be treated as top-level items within src/dst to look for.

  // Pass all rulePatterns to scanDirectory directly.
  // scanDirectory will then construct the full glob patterns relative to sourceDir/targetDir.
  const sourceFilesPromise = scanDirectory(
    sourceDir,
    rulePatterns,
    excludePatterns,
  );
  const targetFilesPromise = scanDirectory(
    targetDir,
    rulePatterns,
    excludePatterns,
  );

  const [sourceFiles, targetFiles] = await Promise.all([
    sourceFilesPromise,
    targetFilesPromise,
  ]);

  // Calculate hashes serially for simplicity
  for (const fileInfo of [...sourceFiles.values(), ...targetFiles.values()]) {
    try {
      fileInfo.hash = await getFileHash(fileInfo.absolutePath);
    } catch (error) {
      // Log error but continue; file without hash will be handled later (e.g., treated as new/different)
      logger.warn(
        `Could not calculate hash for ${fileInfo.absolutePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Ensure hash is undefined if calculation fails
      fileInfo.hash = undefined;
    }
  }
  logger.log(
    `Scan and hash calculation complete. Found ${sourceFiles.size} source items and ${targetFiles.size} target items.`,
  );

  return {
    sourceFiles,
    targetFiles,
  };
}
