import type { FileInfo } from "./scan.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scan } from "./scan.ts";
import * as logger from "./utils/core.ts";
import { confirm, select } from "./utils/prompts.ts";
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
  /** Whether this file was recently deleted from a project */
  recentDeletion?: DeletionInfo;
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
 * Information about a detected file deletion.
 */
export interface DeletionInfo {
  projectName: string;
  deletedAt: Date;
  wasIntentional: boolean;
}

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
 * The complete synchronization plan after user confirmation.
 */
export interface SyncPlan {
  actions: SyncAction[];
  summary: {
    updates: number;
    additions: number;
    deletions: number;
    skips: number;
  };
}

/**
 * Options for multi-project synchronization.
 */
export interface MultiSyncOptions {
  rulePatterns: string[];
  excludePatterns: string[];
  dryRun: boolean;
  autoConfirm?: boolean; // Skip user confirmations, use newest
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
      const scanResult = await scan({
        sourceDir: project.path,
        targetDir: project.path, // We're scanning the same directory
        rulePatterns: options.rulePatterns,
        excludePatterns: options.excludePatterns,
      });

      return { project, files: scanResult.sourceFiles, success: true };
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
          `   ├─ Newest:  ${fileState.newestVersion.projectName} (modified ${formatTime(fileState.newestVersion.lastModified)})`,
        );

        outdatedVersions.forEach((version) => {
          logger.log(
            `   ├─ Outdated: ${version.projectName} (modified ${formatTime(version.lastModified)})`,
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
 * Prompts the user for a decision about what to do with a file that has differences.
 */
async function promptUserForFileDecision(
  fileState: GlobalFileState,
): Promise<UserDecision> {
  // If file only exists in one project, offer to copy it to missing projects
  if (fileState.versions.size === 1 && fileState.missingFrom.length > 0) {
    const sourceProject = Array.from(fileState.versions.keys())[0]!;
    const confirmed = await confirm(
      `Copy ${fileState.relativePath} from ${sourceProject} to ${fileState.missingFrom.length} other project(s)?`,
    );

    return {
      action: confirmed ? "use-newest" : "skip",
      confirmed,
    };
  }

  // If file has multiple versions, let user choose what to do
  if (fileState.versions.size > 1) {
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
      { label: "Skip this file", value: "skip" as const },
    ];

    const choice = await select(
      `What should be done with ${fileState.relativePath}?`,
      options,
    );

    if (choice === "skip") {
      return { action: "skip", confirmed: true };
    } else if (choice === "use-newest") {
      return { action: "use-newest", confirmed: true };
    } else if (choice.startsWith("use-")) {
      const sourceProject = choice.replace("use-", "");
      return {
        action: "use-specific",
        sourceProject,
        confirmed: true,
      };
    }
  }

  // Default to newest version if no specific choice needed
  return { action: "use-newest", confirmed: true };
}

/**
 * Generates auto-confirmed actions using the newest version of each file.
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

/**
 * Formats a Date object for display.
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else {
    return "recently";
  }
}
