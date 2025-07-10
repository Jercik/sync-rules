import type { FileInfo } from "./scan.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scan } from "./scan.ts";
import * as logger from "./utils/core.ts";
import { confirm, select } from "./utils/prompts.ts";
import { formatTime } from "./utils/formatters.ts";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Represents the state of a file across all projects in the sync set.
 */
export interface GlobalFileState {
  /** The relative path of the file (e.g., ".kilocode/rules/api.md") */
  relativePath: string;
  /** Map of project name to file version info */
  versions: Map<string, FileVersion>;
  /** Projects where this file is missing */
  missingFrom: string[];
  /** The newest version across all projects */
  newestVersion?: FileVersion;
  /** Whether all existing versions have identical content */
  allIdentical?: boolean;
}

/**
 * Represents a specific version of a file in a project.
 */
export interface FileVersion {
  projectName: string;
  fileInfo: FileInfo;
  lastModified: Date;
}
/**
/**
 * User's decision for a file state.
 */
export interface UserDecision {
  action: "use-newest" | "use-specific" | "delete-all" | "skip";
  sourceProject?: string; // if use-specific
  confirmed: boolean;
}

/**
 * A planned synchronization action.
 */
export interface SyncAction {
  type: "update" | "add" | "delete" | "skip";
  targetProject: string;
  sourceProject?: string; // for update/add actions
  relativePath: string;
  sourceFile?: FileInfo;
  targetFile?: FileInfo;
}
/**
 * Options for multi-project synchronization.
 */
export interface MultiSyncOptions {
  rulePatterns: string[];
  excludePatterns: string[];
  dryRun: boolean;
  /**
   * Skip user confirmations and automatically use the newest version.
   * When true, the file with the most recent modification date becomes
   * the source of truth for all projects. Never deletes files.
   */
  autoConfirm?: boolean;
  baseDir?: string;
}

/**
 * Scans all projects in parallel and builds a global file state map.
 *
 * @param projects Array of project information
 * @param options Sync options
 * @returns Map of relative paths to global file states
 */
export async function scanAllProjects(
  projects: ProjectInfo[],
  options: MultiSyncOptions,
): Promise<Map<string, GlobalFileState>> {
  logger.log(`Scanning ${projects.length} projects in parallel...`);

  // Scan all projects concurrently, handling failures gracefully
  const scanPromises = projects.map(async (project) => {
    try {
      const files = await scan({
        projectDir: project.path,
        rulePatterns: options.rulePatterns,
        excludePatterns: options.excludePatterns,
      });

      return { project, files, success: true };
    } catch (error) {
      logger.warn(
        `Skipping project ${project.name} due to scan error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { project, files: new Map<string, FileInfo>(), success: false };
    }
  });

  const scanResults = await Promise.all(scanPromises);

  // Filter out failed scans and report successful ones
  const projectScanResults = scanResults.filter((result) => result.success);
  const skippedProjects = scanResults.filter((result) => !result.success);

  if (skippedProjects.length > 0) {
    logger.warn(
      `Skipped ${skippedProjects.length} project(s) due to scanning errors: ${skippedProjects.map((r) => r.project.name).join(", ")}`,
    );
  }

  if (projectScanResults.length === 0) {
    throw new Error("No projects could be successfully scanned");
  }

  logger.log(`Successfully scanned ${projectScanResults.length} project(s)`);

  // Build global file state map
  const globalFileStates = new Map<string, GlobalFileState>();

  // First pass: collect all files from all projects
  for (const { project, files } of projectScanResults) {
    for (const [relativePath, fileInfo] of files) {
      if (fileInfo.isLocal) {
        continue; // Skip local files
      }

      if (!globalFileStates.has(relativePath)) {
        globalFileStates.set(relativePath, {
          relativePath,
          versions: new Map(),
          missingFrom: [],
        });
      }

      const globalState = globalFileStates.get(relativePath)!;

      // Get file modification time
      const stats = await fs.stat(fileInfo.absolutePath);
      const lastModified = stats.mtime;

      globalState.versions.set(project.name, {
        projectName: project.name,
        fileInfo,
        lastModified,
      });
    }
  }

  // Second pass: determine missing files and newest versions
  const allProjectNames = projects.map((p) => p.name);

  for (const globalState of globalFileStates.values()) {
    // Find missing projects
    globalState.missingFrom = allProjectNames.filter(
      (projectName) => !globalState.versions.has(projectName),
    );

    // Find newest version
    const versions = Array.from(globalState.versions.values());
    if (versions.length > 0) {
      globalState.newestVersion = versions.reduce((newest, current) =>
        current.lastModified > newest.lastModified ? current : newest,
      );

      // Check if all versions have the same content
      const hashes = versions
        .map((v) => v.fileInfo.hash)
        .filter((hash) => hash !== undefined);

      if (hashes.length === versions.length && hashes.length > 1) {
        // All files have hashes - check if they're all the same
        const firstHash = hashes[0];
        globalState.allIdentical = hashes.every((hash) => hash === firstHash);
      } else {
        globalState.allIdentical = false;
      }
    }
  }

  logger.log(
    `Found ${globalFileStates.size} unique rule files across all projects`,
  );

  return globalFileStates;
}

/**
 * Presents file states to the user and gets their decisions.
 *
 * In interactive mode (default), prompts the user to choose which version
 * of each file should be the source of truth, with options to:
 * - Use the newest version (by modification date)
 * - Use a version from a specific project
 * - Delete the file from all projects
 * - Skip the file
 *
 * In non-interactive mode (--auto-confirm), automatically selects the
 * newest version based on modification timestamp for all files.
 *
 * @param fileStates Map of global file states
 * @param options Sync options
 * @returns Array of confirmed sync actions
 */
export async function getUserConfirmations(
  fileStates: Map<string, GlobalFileState>,
  options: MultiSyncOptions,
): Promise<SyncAction[]> {
  const actions: SyncAction[] = [];
  let fileIndex = 1;

  if (options.autoConfirm || options.dryRun) {
    // Auto-confirm mode or dry-run: use newest version for all
    return generateAutoConfirmedActions(fileStates);
  }
  // Filter out files that are identical across all projects
  const filesToReview = Array.from(fileStates.values()).filter(
    (fileState) => !fileState.allIdentical || fileState.missingFrom.length > 0,
  );

  logger.log(
    `\nReviewing ${filesToReview.length} files for synchronization (${fileStates.size - filesToReview.length} files are identical across all projects):`,
  );
  logger.log("═".repeat(60));

  for (const fileState of filesToReview) {
    logger.log(`\n${fileIndex}. FILE: ${fileState.relativePath}`);
    fileIndex++;

    if (fileState.newestVersion) {
      const versions = Array.from(fileState.versions.values());
      const outdatedVersions = versions.filter(
        (v) => v.lastModified < fileState.newestVersion!.lastModified,
      );

      if (versions.length > 1 && !fileState.allIdentical) {
        logger.log(
          `   ├─ Newest:  ${fileState.newestVersion.projectName} (modified ${formatTime(fileState.newestVersion.lastModified, true)})`,
        );

        outdatedVersions.forEach((version) => {
          logger.log(
            `   ├─ Outdated: ${version.projectName} (modified ${formatTime(version.lastModified, true)})`,
          );
        });
      } else if (fileState.allIdentical && fileState.missingFrom.length > 0) {
        logger.log(
          `   ├─ Content identical in: ${Array.from(fileState.versions.keys()).join(", ")}`,
        );
      } else {
        logger.log(`   └─ Only in: ${fileState.newestVersion.projectName}`);
      }

      if (fileState.missingFrom.length > 0) {
        logger.log(`   └─ Missing from: ${fileState.missingFrom.join(", ")}`);
      }
    }

    // Get user decision for this file
    const decision = await promptUserForFileDecision(fileState);
    const fileActions = generateActionsForFile(
      fileState,
      decision.action,
      decision.sourceProject,
    );
    actions.push(...fileActions);
  }
  return actions;
}

/**
 /**
  * Prompts the user for a decision about what to do with a file that has differences.
  */
async function promptUserForFileDecision(
  fileState: GlobalFileState,
): Promise<UserDecision> {
  // If file only exists in one project, offer to copy it to missing projects or delete it from all
  if (fileState.versions.size === 1 && fileState.missingFrom.length > 0) {
    const sourceProject = Array.from(fileState.versions.keys())[0]!;

    const options = [
      {
        label: `Copy from ${sourceProject} to ${fileState.missingFrom.length} other project(s)`,
        value: "copy" as const,
      },
      {
        label: `Delete from ${sourceProject} (remove from all projects)`,
        value: "delete-all" as const,
      },
      { label: "Skip this file", value: "skip" as const },
    ];

    const choice = await select(
      `File ${fileState.relativePath} exists only in ${sourceProject}. What should be done?`,
      options,
    );

    if (choice === "copy") {
      return { action: "use-newest", confirmed: true };
    } else if (choice === "delete-all") {
      return { action: "delete-all", confirmed: true };
    } else {
      logger.log(`Skipping file: ${fileState.relativePath}`);
      return { action: "skip", confirmed: true };
    }
  }

  // If file has multiple versions with different content, ask user to choose
  if (fileState.versions.size > 1 && !fileState.allIdentical) {
    const projects = Array.from(fileState.versions.keys());

    const options = [
      {
        label: `Use newest version (from ${fileState.newestVersion?.projectName})`,
        value: "use-newest" as const,
      },
      ...projects.map((project) => ({
        label: `Use version from ${project}`,
        value: `use-${project}` as const,
      })),
      { label: "Delete from all projects", value: "delete-all" as const },
      { label: "Skip this file", value: "skip" as const },
    ];

    const choice = await select(
      `Different versions found for ${fileState.relativePath}. Which version should be used?`,
      options,
    );
    if (choice === "skip") {
      logger.log(`Skipping file: ${fileState.relativePath}`);
      return { action: "skip", confirmed: true };
    } else if (choice === "use-newest") {
      return { action: "use-newest", confirmed: true };
    } else if (choice === "delete-all") {
      return { action: "delete-all", confirmed: true };
    } else if (choice.startsWith("use-")) {
      const sourceProject = choice.replace("use-", "");
      return {
        action: "use-specific",
        sourceProject,
        confirmed: true,
      };
    }
  }

  // Default to newest version if no conflicts or specific choice needed
  return { action: "use-newest", confirmed: true };
}
/**
 * Generates auto-confirmed actions using the newest version of each file.
 *
 * This function is used when --auto-confirm flag is set. It automatically:
 * - Selects the file with the most recent modification date as the source of truth
 * - Creates update actions for all projects with older versions
 * - Creates add actions for all projects missing the file
 * - Skips files that are identical across all projects
 * - Never creates delete actions (deletions require manual confirmation)
 *
 * @param fileStates Map of global file states
 * @returns Array of sync actions to be executed
 */
function generateAutoConfirmedActions(
  fileStates: Map<string, GlobalFileState>,
): SyncAction[] {
  const actions: SyncAction[] = [];

  for (const fileState of fileStates.values()) {
    // Skip files that are identical across all projects
    if (fileState.allIdentical && fileState.missingFrom.length === 0) {
      continue;
    }

    const fileActions = generateActionsForFile(fileState, "use-newest");
    actions.push(...fileActions);
  }

  return actions;
}

/**
 * Generates sync actions for a single file based on user decision.
 *
 * This function creates the appropriate sync actions based on the decision:
 * - "use-newest" or "use-specific": Updates all projects with older versions
 *   and adds the file to all projects where it's missing
 * - "delete-all": Creates delete actions for all projects that have the file
 * - "skip": Returns no actions (leaves files in their current state)
 *
 * When actions are executed (for non-skip decisions), the function ensures
 * that all projects will either:
 * - Have the same version of the file (for use-newest/use-specific)
 * - Not have the file at all (for delete-all)
 *
 * @param fileState The global state of this file across all projects
 * @param decision The user's decision or auto-confirmed action
 * @param sourceProject Optional specific project to use as source (for use-specific)
 * @returns Array of sync actions to execute for this file
 */
function generateActionsForFile(
  fileState: GlobalFileState,
  decision: "use-newest" | "use-specific" | "delete-all" | "skip",
  sourceProject?: string,
): SyncAction[] {
  const actions: SyncAction[] = [];

  if (decision === "skip") {
    return actions;
  }

  if (decision === "delete-all") {
    // Delete from all projects that have it
    for (const version of fileState.versions.values()) {
      actions.push({
        type: "delete",
        targetProject: version.projectName,
        relativePath: fileState.relativePath,
        targetFile: version.fileInfo,
      });
    }
    return actions;
  }

  // Determine source version
  const sourceVersion =
    decision === "use-specific" && sourceProject
      ? fileState.versions.get(sourceProject)
      : fileState.newestVersion;

  if (!sourceVersion) {
    return actions;
  }

  // Update all projects that need the newest version
  for (const [projectName, version] of fileState.versions) {
    if (projectName === sourceVersion.projectName) {
      continue; // Skip source project
    }

    if (version.fileInfo.hash !== sourceVersion.fileInfo.hash) {
      actions.push({
        type: "update",
        targetProject: projectName,
        sourceProject: sourceVersion.projectName,
        relativePath: fileState.relativePath,
        sourceFile: sourceVersion.fileInfo,
        targetFile: version.fileInfo,
      });
    }
  }

  // Add to projects that are missing the file
  for (const missingProject of fileState.missingFrom) {
    actions.push({
      type: "add",
      targetProject: missingProject,
      sourceProject: sourceVersion.projectName,
      relativePath: fileState.relativePath,
      sourceFile: sourceVersion.fileInfo,
    });
  }

  return actions;
}
