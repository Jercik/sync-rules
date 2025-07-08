import { promises as fs } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import * as logger from "./utils/core.ts";
import { normalizePath } from "./utils/core.ts";

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
  rulePatterns: string[] = [".clinerules", ".cursorrules", ".kilocode"],
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
    const subdirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !excludePatterns.includes(name));

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
      `Error discovering projects in ${baseDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return projects;
}

/**
 * Checks if a directory contains any rule files matching the patterns.
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
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const pattern of rulePatterns) {
      // Check for exact directory matches (like .kilocode, .clinerules)
      const hasDirectory = entries.some(
        (entry) => entry.isDirectory() && entry.name === pattern,
      );

      // Check for exact file matches (like .cursorrules)
      const hasFile = entries.some(
        (entry) => entry.isFile() && entry.name === pattern,
      );

      if (hasDirectory || hasFile) {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.debug(
      `Could not check rule files in ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Validates that all provided project paths exist and are directories.
 *
 * @param projectPaths Array of project paths to validate
 * @throws Error if any project path is invalid
 */
export async function validateProjects(projectPaths: string[]): Promise<void> {
  for (const projectPath of projectPaths) {
    const normalizedPath = normalizePath(projectPath);

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
        `Cannot access project directory ${projectPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
