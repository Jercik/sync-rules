import { promises as fs } from "node:fs";
import fg from "fast-glob";
import path from "node:path";
import { homedir } from "node:os";
import * as logger from "./utils/core.ts";
import { normalizePath, validatePathSecurity } from "./utils/core.ts";

/**
 * Represents a discovered project directory.
 */
export interface ProjectInfo {
  /** The display name for the project (usually the directory name). */
  name: string;
  /** The absolute path to the project directory. */
  path: string;
}

/**
 * Discovers all potential project directories within a base directory.
 * A directory is considered a project if it contains at least one of the rule patterns.
 *
 * @param baseDir The base directory to search in (defaults to ~/Developer)
 * @param rulePatterns Array of rule patterns to look for
 * @param excludePatterns Array of patterns to exclude
 * @returns Promise resolving to array of discovered projects
 */
export async function discoverProjects(
  baseDir: string = path.join(homedir(), "Developer"),
  rulePatterns: string[] = [".clinerules.md", ".cursorrules.md", ".kilocode"],
  excludePatterns: string[] = ["node_modules", ".git", "dist", "build"],
): Promise<ProjectInfo[]> {
  logger.log(`Discovering projects in: ${baseDir}`);

  const normalizedBaseDir = normalizePath(baseDir);
  const projects: ProjectInfo[] = [];

  try {
    // Check if base directory exists
    const baseStat = await fs.stat(normalizedBaseDir);
    if (!baseStat.isDirectory()) {
      throw new Error(`Base directory is not a directory: ${baseDir}`);
    }

    // Get all subdirectories
    const entries = await fs.readdir(normalizedBaseDir, {
      withFileTypes: true,
    });

    // Filter subdirectories based on exclude patterns
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirName = entry.name;

      // Check if this directory should be excluded
      let shouldExclude = false;

      for (const pattern of excludePatterns) {
        // Check exact matches
        if (pattern === dirName) {
          shouldExclude = true;
          break;
        }

        // For glob patterns, we need to check if the directory name matches
        if (fg.isDynamicPattern(pattern)) {
          // Create a temporary list with just this directory name
          // and see if it matches the pattern
          const matches = await fg([pattern], {
            cwd: normalizedBaseDir,
            onlyDirectories: true,
            dot: true,
            absolute: false,
          });

          // Check if our directory name is in the matches
          if (matches.includes(dirName)) {
            shouldExclude = true;
            break;
          }

          // Also check patterns like "**/temp" against the directory name
          if (pattern.includes("**/")) {
            const simplifiedPattern = pattern.replace("**/", "");
            if (fg.isDynamicPattern(simplifiedPattern)) {
              const simpleMatches = await fg([simplifiedPattern], {
                cwd: normalizedBaseDir,
                onlyDirectories: true,
                dot: true,
                absolute: false,
              });
              if (simpleMatches.includes(dirName)) {
                shouldExclude = true;
                break;
              }
            } else if (simplifiedPattern === dirName) {
              shouldExclude = true;
              break;
            }
          }
        }
      }

      if (!shouldExclude) {
        subdirs.push(dirName);
      }
    }

    // Check each subdirectory for rule files
    for (const dirName of subdirs) {
      const dirPath = normalizePath(path.join(normalizedBaseDir, dirName));

      if (await hasRuleFiles(dirPath, rulePatterns)) {
        projects.push({
          name: dirName,
          path: dirPath,
        });
      }
    }

    logger.log(`Discovered ${projects.length} projects with rule files`);
    if (logger.debug) {
      projects.forEach((project) => {
        logger.debug(`  Found project: ${project.name} at ${project.path}`);
      });
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Base directory does not exist: ${baseDir}`);
    }
    throw new Error(
      `Error discovering projects in ${baseDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return projects;
}

/**
 * Checks if a directory contains any rule files matching the patterns.
 * Respects the .md constraint to match scan behavior.
 *
 * @param dirPath The directory path to check
 * @param rulePatterns Array of rule patterns to look for
 * @returns Promise resolving to true if rule files are found
 */
async function hasRuleFiles(
  dirPath: string,
  rulePatterns: string[],
): Promise<boolean> {
  try {
    // Build effective patterns that only match .md files
    const effectivePatterns: string[] = [];
    
    for (const pattern of rulePatterns) {
      if (pattern.endsWith(".md")) {
        // Already .md file
        effectivePatterns.push(pattern);
      } else if (!pattern.includes("*") && !pattern.includes("/")) {
        // Check if it's a directory
        try {
          const stats = await fs.stat(path.join(dirPath, pattern));
          if (stats.isDirectory()) {
            // Directory pattern - search for .md files recursively
            effectivePatterns.push(`${pattern}/**/*.md`);
          } else if (stats.isFile() && pattern.endsWith(".md")) {
            effectivePatterns.push(pattern);
          }
        } catch (e) {
          // If stat fails, treat as a file pattern
          if (pattern.endsWith(".md")) {
            effectivePatterns.push(pattern);
          }
        }
      } else if (pattern.includes("*") && pattern.endsWith(".md")) {
        // Glob pattern already ending in .md
        effectivePatterns.push(pattern);
      }
    }

    if (effectivePatterns.length === 0) {
      return false;
    }

    const entries = await fg(effectivePatterns, {
      cwd: dirPath,
      dot: true,
      onlyFiles: true,
      absolute: false,
      stats: false,
      followSymbolicLinks: false,
      deep: Infinity, // Match scan.ts behavior for consistency
    });

    return entries.length > 0;
  } catch (error) {
    logger.debug(
      `Could not check rule files in ${dirPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
/**
 * Validates that all provided project paths exist and are directories.
 * Also validates against path traversal attacks.
 *
 * @param projectPaths Array of project paths to validate
 * @param baseDir Optional base directory for path traversal validation
 * @throws Error if any project path is invalid or attempts path traversal
 */
export async function validateProjects(
  projectPaths: string[], 
  baseDir?: string
): Promise<void> {
  for (const projectPath of projectPaths) {
    let normalizedPath: string;
    
    try {
      if (baseDir) {
        // Validate path security when base directory is provided
        normalizedPath = validatePathSecurity(projectPath, baseDir);
      } else {
        // For absolute paths, just normalize
        normalizedPath = normalizePath(projectPath);
      }
    } catch (error) {
      throw new Error(
        `Invalid project path: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        throw new Error(`Project path is not a directory: ${projectPath}`);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(`Project directory does not exist: ${projectPath}`);
      }
      throw new Error(
        `Cannot access project directory ${projectPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
