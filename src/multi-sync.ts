import type { FileInfo } from "./scan.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scan } from "./scan.ts";
import * as logger from "./utils/core.ts";
import { confirm, select } from "./utils/prompts.ts";
import { formatTime } from "./utils/formatters.ts";
import { getFileHash } from "./utils/core.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import { ManifestSchema, LocalManifestSchema } from "./utils/manifest-validator.ts";
import type { Manifest, LocalManifest, RuleCondition } from "./utils/manifest-validator.ts";
import { scanSingleFileAcrossProjects } from "./utils/file-scanner.ts";
import { buildGlobalFileStates } from "./utils/file-state-builder.ts";
import { createProjectMap, findProjectByName } from "./utils/project-utils.ts";
import { promptUserForFileDecision } from "./utils/file-decision-strategies.ts";

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
  /**
   * Force overwrite existing files when adding (bypasses atomic copy protection).
   * Only used when a file would be added to a project but already exists there.
   */
  force?: boolean;
}


// Special manifest path
const MANIFEST_PATH = '.kilocode/manifest.json';
const LOCAL_MANIFEST_PATH = '.kilocode/manifest.local.json';

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
        projectName: project.name, // Pass project name for logging
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

  // Build map of files by project for the state builder
  const filesByProject = new Map<string, Map<string, FileInfo>>();
  for (const { project, files } of projectScanResults) {
    filesByProject.set(project.name, files);
  }

  // Use the consolidated state builder
  const globalFileStates = await buildGlobalFileStates(projects, filesByProject);

  logger.log(
    `Found ${globalFileStates.size} unique rule files across all projects`,
  );

  return globalFileStates;
}

/**
 * Handles initial manifest synchronization across projects.
 * 
 * When manifests differ across projects, this function ensures they are
 * consistent before regular rule synchronization begins. It treats manifests
 * as a special case with a separate interactive decision point.
 * 
 * @param projects Array of project information
 * @param options Sync options
 * @returns The consistent manifest object if found, null otherwise
 */
export async function handleManifestSync(
  projects: ProjectInfo[],
  options: MultiSyncOptions
): Promise<Manifest | null> {
  // Use the new utility to scan manifest files across all projects
  const manifestState = await scanSingleFileAcrossProjects(projects, MANIFEST_PATH);

  // If no manifests found, return null
  if (manifestState.versions.size === 0) {
    return null;
  }

  // If all identical and present everywhere, load and return
  if (manifestState.allIdentical && manifestState.missingFrom.length === 0) {
    const content = await fs.readFile(manifestState.newestVersion!.fileInfo.absolutePath, 'utf8');
    try {
      const parsed = JSON.parse(content);
      return ManifestSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error(`Invalid manifest structure in ${manifestState.newestVersion!.projectName}:`);
        const { logZodErrors } = await import("./utils/common-functions.ts");
        logZodErrors(error);
        logger.error("Treating invalid manifest as if it doesn't exist - sync will continue");
        return null;
      }
      // For JSON parse errors, also treat as missing
      if (error instanceof SyntaxError) {
        logger.error(`Invalid JSON in manifest from ${manifestState.newestVersion!.projectName}: ${error.message}`);
        logger.error("Treating invalid manifest as if it doesn't exist - sync will continue");
        return null;
      }
      throw error;
    }
  }

  // Manifests differ or missing from some - need to sync them first
  logger.log("\nManifest files (.kilocode/manifest.json) differ across projects. Resolving first...");
  
  if (manifestState.newestVersion) {
    const selectedProject = manifestState.newestVersion.projectName;
    const lastModified = formatTime(manifestState.newestVersion.lastModified, true);
    logger.log(`\nSelecting manifest from ${selectedProject} (last modified ${lastModified}) as source of truth`);
  }

  let syncActions: SyncAction[] = [];

  if (options.autoConfirm || options.dryRun) {
    syncActions = await generateAutoConfirmedActions(new Map([[MANIFEST_PATH, manifestState]]), null, projects);
  } else {
    // Interactive: prompt user for decision
    const decision = await promptUserForFileDecision(manifestState);
    syncActions = await generateActionsForFile(manifestState, decision.action, decision.sourceProject, null, undefined, true);
  }

  // Execute manifest sync actions
  const { executeSyncActions } = await import("./cli.ts");
  await executeSyncActions(syncActions, options, projects);

  logger.log("Manifest synced. Rescanning projects with consistent manifest...");

  // Return the now-consistent manifest
  if (projects.length === 0) {
    return null;
  }
  const firstProject = projects[0];
  if (!firstProject) {
    return null;
  }
  const consistentManifestPath = path.join(firstProject.path, MANIFEST_PATH); // Any project now has the same
  const content = await fs.readFile(consistentManifestPath, 'utf8').catch(() => null);
  if (!content) {
    return null;
  }
  
  try {
    const parsed = JSON.parse(content);
    return ManifestSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Invalid manifest structure after sync:`);
      const { logZodErrors } = await import("./utils/common-functions.ts");
      logZodErrors(error);
      logger.error("Treating invalid manifest as if it doesn't exist - sync will continue");
      return null;
    }
    // For JSON parse errors, also treat as missing
    if (error instanceof SyntaxError) {
      logger.error(`Invalid JSON in manifest after sync: ${error.message}`);
      logger.error("Treating invalid manifest as if it doesn't exist - sync will continue");
      return null;
    }
    throw error;
  }
}

/**
 * Loads local manifest overrides for a project if they exist.
 * 
 * @param projectPath The project directory path
 * @returns Local manifest object or null if not found
 */
async function loadLocalManifest(projectPath: string): Promise<LocalManifest | null> {
  try {
    const localManifestPath = path.join(projectPath, LOCAL_MANIFEST_PATH);
    const content = await fs.readFile(localManifestPath, 'utf8');
    const parsed = JSON.parse(content);
    return LocalManifestSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`Invalid local manifest structure in ${projectPath}, ignoring:`);
      const { formatZodErrors } = await import("./utils/common-functions.ts");
      const errors = formatZodErrors(error);
      errors.forEach(err => logger.warn(`  - ${err}`));
    }
    return null; // No local manifest, invalid JSON, or validation failed
  }
}

/**
 * Checks if a rule file should be included based on manifest conditions.
 * 
 * @param relativePath The relative path of the rule file
 * @param targetProjectPath The target project directory
 * @param manifest The manifest object
 * @param localManifest Optional local manifest overrides
 * @returns True if the rule should be included, false otherwise
 */
async function shouldIncludeRule(
  relativePath: string,
  targetProjectPath: string,
  manifest: Manifest | null,
  localManifest: LocalManifest | null
): Promise<boolean> {
  // Check local overrides first
  if (localManifest) {
    if (localManifest.exclude?.includes(relativePath)) {
      return false; // Explicitly excluded
    }
    if (localManifest.include?.includes(relativePath)) {
      return true; // Explicitly included
    }
  }

  // If no manifest, include all rules
  if (!manifest) {
    return true;
  }

  // Check if rule has a condition in manifest
  const ruleCondition = manifest.rules[relativePath];
  if (!ruleCondition) {
    return true; // No condition means always include
  }

  // Check if condition glob matches any files in target project
  const matches = await fg(ruleCondition.condition, {
    cwd: targetProjectPath,
    onlyFiles: true,
    absolute: false,
  });

  return matches.length > 0;
}

/**
 * Handles extraneous files that exist in projects but shouldn't based on manifest.
 * 
 * @param projects Array of project information
 * @param manifest The manifest object
 * @param options Sync options
 * @returns Array of delete actions for extraneous files
 */
export async function handleExtraneousFiles(
  projects: ProjectInfo[],
  manifest: Manifest | null,
  options: MultiSyncOptions
): Promise<SyncAction[]> {
  if (!manifest) {
    return []; // No manifest means no extraneous file handling
  }

  const deleteActions: SyncAction[] = [];
  
  logger.log("\nChecking for extraneous files based on manifest conditions...");

  // Scan all projects to find existing rule files
  const globalFileStates = await scanAllProjects(projects, options);

  for (const [relativePath, fileState] of globalFileStates) {
    // Skip manifest itself and local files
    if (relativePath === MANIFEST_PATH || relativePath === LOCAL_MANIFEST_PATH) {
      continue;
    }

    // Check each project that has this file
    for (const [projectName, version] of fileState.versions) {
      const project = findProjectByName(projects, projectName);
      if (!project) continue;

      const localManifest = await loadLocalManifest(project.path);
      const shouldInclude = await shouldIncludeRule(relativePath, project.path, manifest, localManifest);

      if (!shouldInclude) {
        // File exists but shouldn't based on manifest
        deleteActions.push({
          type: "delete",
          targetProject: projectName,
          relativePath,
          targetFile: version.fileInfo,
        });
      }
    }
  }

  if (deleteActions.length === 0) {
    logger.log("No extraneous files found.");
    return [];
  }

  // Report extraneous files
  logger.log(`\nFound ${deleteActions.length} extraneous file(s) that don't meet manifest conditions:`);
  const filesByPath = new Map<string, string[]>();
  
  for (const action of deleteActions) {
    if (!filesByPath.has(action.relativePath)) {
      filesByPath.set(action.relativePath, []);
    }
    filesByPath.get(action.relativePath)!.push(action.targetProject);
  }

  for (const [filePath, projectNames] of filesByPath) {
    logger.log(`  - ${filePath} in: ${projectNames.join(", ")}`);
  }

  // Get user confirmation
  if (!options.dryRun && !options.autoConfirm) {
    const proceed = await confirm("\nDelete these extraneous files?");
    if (!proceed) {
      logger.log("Keeping extraneous files.");
      return [];
    }
  } else if (options.autoConfirm) {
    logger.log("\nAuto-confirm mode: Keeping extraneous files (deletions require manual confirmation).");
    return [];
  }

  return deleteActions;
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
 * @param manifest The manifest object for conditional rules
 * @param options Sync options
 * @param projects Array of project information
 * @returns Array of confirmed sync actions
 */
export async function getUserConfirmations(
  fileStates: Map<string, GlobalFileState>,
  manifest: Manifest | null,
  options: MultiSyncOptions,
  projects: ProjectInfo[],
): Promise<SyncAction[]> {
  const actions: SyncAction[] = [];
  let fileIndex = 1;

  if (options.autoConfirm || options.dryRun) {
    // Auto-confirm mode or dry-run: use newest version for all
    return generateAutoConfirmedActions(fileStates, manifest, projects);
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
    // Log file header
    logger.log(`\n${fileIndex}. FILE: ${fileState.relativePath}`);
    fileIndex++;

    if (fileState.newestVersion) {
      const versions = Array.from(fileState.versions.values());
      const outdatedVersions = versions.filter(
        (v) => v.lastModified < fileState.newestVersion!.lastModified,
      );

      // Log versions, grouped by hash if multiple
      if (versions.length > 1) {
        // Group by hash
        const groups = new Map<
          string,
          { projects: string[]; newestInGroup: FileVersion }
        >();
        for (const version of versions) {
          const hash = version.fileInfo.hash || "";
          if (!groups.has(hash)) {
            groups.set(hash, { projects: [], newestInGroup: version });
          }
          const group = groups.get(hash)!;
          group.projects.push(version.projectName);
          if (version.lastModified > group.newestInGroup.lastModified) {
            group.newestInGroup = version;
          }
        }

        // Sort groups by newest timestamp descending
        const sortedGroups = Array.from(groups.values()).sort(
          (a, b) =>
            b.newestInGroup.lastModified.getTime() -
            a.newestInGroup.lastModified.getTime(),
        );

        // Log groups
        sortedGroups.forEach((group, index) => {
          const prefix = index === 0 ? "├─" : "├─";
          const versionLabel = `Version ${index + 1} (newest in ${group.newestInGroup.projectName} at ${formatTime(group.newestInGroup.lastModified, true)}): ${group.projects.join(", ")}`;
          logger.log(`   ${prefix} ${versionLabel}`);
        });
      } else if (fileState.newestVersion) {
        logger.log(`   └─ Only in: ${fileState.newestVersion.projectName}`);
      }

      // Log missing if any
      if (fileState.missingFrom.length > 0) {
        logger.log(`   └─ Missing from: ${fileState.missingFrom.join(", ")}`);
      }
    }

    // Get user decision for this file
    const decision = await promptUserForFileDecision(fileState);
    const fileActions = await generateActionsForFile(
      fileState,
      decision.action,
      decision.sourceProject,
      manifest,
      projects,
    );
    actions.push(...fileActions);
  }
  return actions;
}

// promptUserForFileDecision is now imported from file-decision-strategies.ts
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
 * @param manifest The manifest object for conditional rules
 * @param projects Array of project information for checking existing files
 * @returns Array of sync actions to be executed
 */
async function generateAutoConfirmedActions(
  fileStates: Map<string, GlobalFileState>,
  manifest: Manifest | null,
  projects: ProjectInfo[],
): Promise<SyncAction[]> {
  const actions: SyncAction[] = [];
  const additionsWarning: string[] = [];
  const overwriteWarnings: string[] = [];

  // Create project lookup map
  let projectMap: Map<string, string>;
  try {
    projectMap = createProjectMap(projects);
  } catch (error) {
    // This should have been caught earlier in CLI, but handle it for safety
    logger.error("Cannot generate auto-confirmed actions due to duplicate project names");
    return [];
  }

  for (const fileState of fileStates.values()) {
    // Skip files that are identical across all projects
    if (fileState.allIdentical && fileState.missingFrom.length === 0) {
      continue;
    }

    const isManifestFile = fileState.relativePath === MANIFEST_PATH;
    const fileActions = await generateActionsForFile(fileState, "use-newest", undefined, manifest, projects, isManifestFile);
    
    // Check for potential overwrites in add actions
    for (const action of fileActions) {
      if (action.type === "add") {
        const targetProjectPath = projectMap.get(action.targetProject);
        if (targetProjectPath) {
          const targetPath = path.join(targetProjectPath, action.relativePath);
          try {
            await fs.access(targetPath);
            // File exists, this would be an overwrite
            overwriteWarnings.push(
              `  - ${action.relativePath} in ${action.targetProject} (file already exists!)`
            );
          } catch {
            // File doesn't exist, safe to add
          }
        }
      }
    }
    
    actions.push(...fileActions);
    
    // Track files that will be added to projects
    const addActions = fileActions.filter(a => a.type === "add");
    if (addActions.length > 0) {
      additionsWarning.push(
        `  - ${fileState.relativePath} will be added to ${addActions.length} project(s)`
      );
    }
  }

  // Warn about additions and potential overwrites in auto-confirm mode
  if (overwriteWarnings.length > 0) {
    logger.warn("\n⚠️  WARNING: Auto-confirm will OVERWRITE the following existing files:");
    overwriteWarnings.forEach(msg => logger.warn(msg));
    logger.warn("\nThese files already exist and will be replaced with versions from other projects!");
  }
  
  if (additionsWarning.length > 0) {
    logger.warn("\n⚠️  Auto-confirm will add the following files to projects:");
    additionsWarning.forEach(msg => logger.warn(msg));
    
    if (overwriteWarnings.length === 0) {
      logger.warn("\nNote: Use --dry-run first to preview changes, or use interactive mode for more control.");
    } else {
      logger.warn("\nSTRONGLY RECOMMENDED: Use --dry-run first or use interactive mode to review these changes!");
    }
    logger.warn("");
  }

  return actions;
}

/**
 * Generates sync actions for a single file based on user decision.
 *
 * This function creates the appropriate sync actions based on the decision:
 * - "use-newest" or "use-specific": Updates all projects with older versions
 *   and adds the file to all projects where it's missing (if manifest conditions are met)
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
 * @param manifest The manifest object for conditional rules
 * @param projects Array of project information
 * @param isManifest Whether this file is the manifest itself (skips condition checks)
 * @returns Array of sync actions to execute for this file
 */
async function generateActionsForFile(
  fileState: GlobalFileState,
  decision: "use-newest" | "use-specific" | "delete-all" | "skip",
  sourceProject?: string,
  manifest?: Manifest | null,
  projects?: ProjectInfo[],
  isManifest: boolean = false,
): Promise<SyncAction[]> {
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
    // Check manifest conditions unless this is the manifest itself
    if (!isManifest && manifest && projects) {
      const targetProject = findProjectByName(projects, missingProject);
      if (targetProject) {
        const localManifest = await loadLocalManifest(targetProject.path);
        const shouldInclude = await shouldIncludeRule(
          fileState.relativePath,
          targetProject.path,
          manifest,
          localManifest
        );
        
        if (!shouldInclude) {
          continue; // Skip this project, conditions not met
        }
      }
    }
    
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
