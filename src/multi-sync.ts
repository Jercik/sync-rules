import type { FileInfo } from "./scan.ts";
import type { ProjectInfo } from "./discovery.ts";
import { scan } from "./scan.ts";
import * as logger from "./utils/core.ts";
import { confirm, select } from "./utils/prompts.ts";
import { formatTime } from "./utils/formatters.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildGlobalFileStates } from "./utils/file-state-builder.ts";
import { createProjectMap, findProjectByName } from "./utils/project-utils.ts";
import { promptUserForFileDecision } from "./utils/file-decision-strategies.ts";

const MANIFEST_PATH = '.kilocode/rules/manifest.txt';

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
  autoConfirm?: boolean;
  baseDir?: string;
  force?: boolean;
}

/**
 * Scans all projects in parallel and builds a global file state map.
 */
export async function scanAllProjects(
  projects: ProjectInfo[],
  options: MultiSyncOptions,
): Promise<Map<string, GlobalFileState>> {
  logger.log(`Scanning ${projects.length} projects in parallel...`);

  const scanPromises = projects.map(async (project) => {
    try {
      const files = await scan({
        projectDir: project.path,
        projectName: project.name,
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

  const filesByProject = new Map<string, Map<string, FileInfo>>();
  for (const { project, files } of projectScanResults) {
    filesByProject.set(project.name, files);
  }

  const globalFileStates = await buildGlobalFileStates(projects, filesByProject);

  logger.log(
    `Found ${globalFileStates.size} unique rule files across all projects`,
  );

  return globalFileStates;
}

/**
 * Checks if a rule should be included in a target project based on its manifest.
 */
async function shouldIncludeRule(
  relativePath: string,
  targetProjectPath: string
): Promise<boolean> {
  const manifestPath = path.join(targetProjectPath, MANIFEST_PATH);
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const desiredRules = manifestContent.split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    return desiredRules.includes(relativePath);
  } catch {
    return false; // No manifest means no sync
  }
}

/**
 * Checks if a file path matches the local pattern (*.local.*).
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
 * Reports orphaned rules (listed in manifests but not found in any project).
 */
async function reportOrphanedRules(
  fileStates: Map<string, GlobalFileState>,
  projects: ProjectInfo[]
): Promise<void> {
  const orphanedRules: { project: string; rule: string }[] = [];
  const allRules = new Set(fileStates.keys());

  for (const project of projects) {
    const manifestPath = path.join(project.path, MANIFEST_PATH);
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const desiredRules = manifestContent.split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      for (const rule of desiredRules) {
        // Skip local files as they are intentionally excluded from sync
        if (!isLocalFile(rule) && !allRules.has(rule)) {
          orphanedRules.push({ project: project.name, rule });
        }
      }
    } catch {
      // No manifest, skip
    }
  }

  if (orphanedRules.length > 0) {
    logger.warn("\n⚠️  Found orphaned rules in manifests:");
    for (const { project, rule } of orphanedRules) {
      logger.warn(`  - ${project}: ${rule} (not found in any project)`);
    }
    logger.warn("\nConsider updating manifest files to remove these entries.");
  }
}

/**
 * Presents file states to the user and gets their decisions.
 */
export async function getUserConfirmations(
  fileStates: Map<string, GlobalFileState>,
  manifest: any | null,  // Keeping for compatibility, but unused now
  options: MultiSyncOptions,
  projects: ProjectInfo[],
): Promise<SyncAction[]> {
  // Report orphaned rules first
  await reportOrphanedRules(fileStates, projects);

  const actions: SyncAction[] = [];
  let fileIndex = 1;

  if (options.autoConfirm || options.dryRun) {
    return generateAutoConfirmedActions(fileStates, null, projects);
  }

  // Handle projects with empty manifests in interactive mode
  if (projects) {
    for (const project of projects) {
      const manifestPath = path.join(project.path, MANIFEST_PATH);
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const desiredRules = manifestContent.split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        
        // If manifest exists but is empty, we need to delete all rule files from this project
        if (desiredRules.length === 0) {
          const projectFiles: string[] = [];
          
          // Find all files that exist in this project
          for (const fileState of fileStates.values()) {
            const projectVersion = fileState.versions.get(project.name);
            if (projectVersion) {
              projectFiles.push(fileState.relativePath);
            }
          }
          
          if (projectFiles.length > 0) {
            logger.log(`\n⚠️  Project '${project.name}' has an empty manifest but contains ${projectFiles.length} rule files.`);
            logger.log(`Files to delete: ${projectFiles.join(', ')}`);
            
            const deleteConfirmed = await confirm(`Delete all rule files from project '${project.name}'?`);
            
            if (deleteConfirmed) {
              // Create delete actions for all files in this project
              for (const fileState of fileStates.values()) {
                const projectVersion = fileState.versions.get(project.name);
                if (projectVersion) {
                  actions.push({
                    type: "delete",
                    targetProject: project.name,
                    relativePath: fileState.relativePath,
                    targetFile: projectVersion.fileInfo,
                  });
                }
              }
            }
          }
        }
      } catch {
        // No manifest file - skip this project entirely
      }
    }
  }

  // Track files that were already handled by empty manifest logic
  const handledFiles = new Set<string>();
  for (const action of actions) {
    if (action.type === "delete") {
      handledFiles.add(action.relativePath);
    }
  }

  const filesToReview = Array.from(fileStates.values()).filter(
    (fileState) => 
      !handledFiles.has(fileState.relativePath) && 
      (!fileState.allIdentical || fileState.missingFrom.length > 0),
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

      if (versions.length > 1) {
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

        const sortedGroups = Array.from(groups.values()).sort(
          (a, b) =>
            b.newestInGroup.lastModified.getTime() -
            a.newestInGroup.lastModified.getTime(),
        );

        sortedGroups.forEach((group, index) => {
          const prefix = index === 0 ? "├─" : "├─";
          const versionLabel = `Version ${index + 1} (newest in ${group.newestInGroup.projectName} at ${formatTime(group.newestInGroup.lastModified, true)}): ${group.projects.join(", ")}`;
          logger.log(`   ${prefix} ${versionLabel}`);
        });
      } else if (fileState.newestVersion) {
        logger.log(`   └─ Only in: ${fileState.newestVersion.projectName}`);
      }

      if (fileState.missingFrom.length > 0) {
        logger.log(`   └─ Missing from: ${fileState.missingFrom.join(", ")}`);
      }
    }

    const decision = await promptUserForFileDecision(fileState);
    const fileActions = await generateActionsForFile(
      fileState,
      decision.action,
      decision.sourceProject,
      null,
      projects,
    );
    actions.push(...fileActions);
  }
  
  // If we only have delete actions from empty manifests and no files to review, log that
  if (filesToReview.length === 0 && actions.length > 0) {
    logger.log(`\nNo files need synchronization updates, but ${actions.length} delete actions will be performed for empty manifests.`);
  }
  
  return actions;
}

/**
 * Generates auto-confirmed actions using the newest version of each file.
 */
async function generateAutoConfirmedActions(
  fileStates: Map<string, GlobalFileState>,
  manifest: any | null,
  projects: ProjectInfo[],
): Promise<SyncAction[]> {
  const actions: SyncAction[] = [];
  const additionsWarning: string[] = [];
  const overwriteWarnings: string[] = [];

  let projectMap: Map<string, string>;
  try {
    projectMap = createProjectMap(projects);
  } catch (error) {
    logger.error("Cannot generate auto-confirmed actions due to duplicate project names");
    return [];
  }

  // First, handle projects with empty manifests - they should have all files deleted
  if (projects) {
    for (const project of projects) {
      const manifestPath = path.join(project.path, MANIFEST_PATH);
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const desiredRules = manifestContent.split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        
        // If manifest exists but is empty, we need to delete all rule files from this project
        if (desiredRules.length === 0) {
          // Find all files that exist in this project and create delete actions
          for (const fileState of fileStates.values()) {
            const projectVersion = fileState.versions.get(project.name);
            if (projectVersion) {
              actions.push({
                type: "delete",
                targetProject: project.name,
                relativePath: fileState.relativePath,
                targetFile: projectVersion.fileInfo,
              });
            }
          }
        }
      } catch {
        // No manifest file - skip this project entirely
      }
    }
  }

  for (const fileState of fileStates.values()) {
    if (fileState.allIdentical && fileState.missingFrom.length === 0) {
      continue;
    }

    const fileActions = await generateActionsForFile(fileState, "use-newest", undefined, null, projects);
    
    for (const action of fileActions) {
      if (action.type === "add") {
        const targetProjectPath = projectMap.get(action.targetProject);
        if (targetProjectPath) {
          const targetPath = path.join(targetProjectPath, action.relativePath);
          try {
            await fs.access(targetPath);
            overwriteWarnings.push(
              `  - ${action.relativePath} in ${action.targetProject} (file already exists!)`
            );
          } catch {
            // File doesn't exist
          }
        }
      }
    }
    
    actions.push(...fileActions);
    
    const addActions = fileActions.filter(a => a.type === "add");
    if (addActions.length > 0) {
      additionsWarning.push(
        `  - ${fileState.relativePath} will be added to ${addActions.length} project(s)`
      );
    }
  }

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
 */
async function generateActionsForFile(
  fileState: GlobalFileState,
  decision: "use-newest" | "use-specific" | "delete-all" | "skip",
  sourceProject?: string,
  manifest?: any | null,
  projects?: ProjectInfo[],
): Promise<SyncAction[]> {
  const actions: SyncAction[] = [];

  if (decision === "skip") {
    return actions;
  }

  if (decision === "delete-all") {
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

  const sourceVersion =
    decision === "use-specific" && sourceProject
      ? fileState.versions.get(sourceProject)
      : fileState.newestVersion;

  if (!sourceVersion) {
    return actions;
  }

  for (const [projectName, version] of fileState.versions) {
    if (projectName === sourceVersion.projectName) {
      continue;
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

  for (const missingProject of fileState.missingFrom) {
    // Note: missingFrom should now only contain projects that want this file
    // according to their manifests (filtered upstream in buildGlobalFileStates),
    // but we keep a basic validation as backup
    if (projects) {
      const targetProject = findProjectByName(projects, missingProject);
      if (targetProject) {
        const shouldInclude = await shouldIncludeRule(
          fileState.relativePath,
          targetProject.path
        );
        
        if (!shouldInclude) {
          // This should not happen with the new upstream filtering,
          // but we log a warning if it does for debugging
          logger.warn(`Warning: Project ${missingProject} in missingFrom but manifest doesn't include ${fileState.relativePath}`);
          continue;
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