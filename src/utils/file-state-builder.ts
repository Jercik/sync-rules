import type { ProjectInfo } from "../discovery.ts";
import type { GlobalFileState, FileVersion } from "../multi-sync.ts";
import type { FileInfo } from "../scan.ts";
import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import { findProjectByPath } from "./project-utils.ts";
import * as logger from "./core.ts";

const MANIFEST_PATH = '.kilocode/rules/manifest.txt';

/**
 * Loads and parses a project's manifest file.
 * Returns an array of rule file paths that the project wants to receive.
 * Returns empty array if no manifest exists or if manifest is empty.
 * 
 * @param projectPath The absolute path to the project directory
 * @returns Array of relative rule file paths listed in the manifest
 */
async function loadProjectManifest(projectPath: string): Promise<string[]> {
  const manifestPath = path.join(projectPath, MANIFEST_PATH);
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const desiredRules = manifestContent.split('\n')
      .map(line => line.trim())
      .filter(Boolean); // Remove empty lines and whitespace-only lines
    return desiredRules;
  } catch {
    // No manifest file or error reading it - return empty array
    // This means the project receives no rule synchronization
    return [];
  }
}

/**
 * Interface for providing file data for state building.
 * Allows different implementations for scanned files vs single file lookups.
 */
export interface FileDataProvider {
  getFileData(projectPath: string, relativePath: string): Promise<{
    absolutePath: string;
    hash: string;
    stats: Stats;
  } | null>;
}

/**
 * Builds a GlobalFileState for a single file across all projects.
 * This consolidates the duplicated logic from scanAllProjects and scanSingleFileAcrossProjects.
 * 
 * @param projects Array of project information
 * @param relativePath The relative path of the file
 * @param fileDataProvider Provider for file data (stats, hash, etc.)
 * @returns GlobalFileState object with versions, missingFrom, newestVersion, and allIdentical
 */
export async function buildGlobalFileState(
  projects: ProjectInfo[],
  relativePath: string,
  fileDataProvider: FileDataProvider
): Promise<GlobalFileState> {
  const state: GlobalFileState = {
    relativePath,
    versions: new Map(),
    missingFrom: [],
  };

  // First pass: collect versions from each project
  for (const project of projects) {
    try {
      const fileData = await fileDataProvider.getFileData(project.path, relativePath);
      if (fileData) {
        state.versions.set(project.name, {
          projectName: project.name,
          fileInfo: {
            relativePath,
            absolutePath: fileData.absolutePath,
            hash: fileData.hash,
          },
          lastModified: fileData.stats.mtime,
        });
      } else {
        state.missingFrom.push(project.name);
      }
    } catch {
      // File doesn't exist or can't be accessed in this project
      state.missingFrom.push(project.name);
    }
  }

  // Second pass: compute newest version and check if all identical
  const versions = Array.from(state.versions.values());
  if (versions.length > 0) {
    // Find newest version
    state.newestVersion = versions.reduce((newest, current) =>
      current.lastModified > newest.lastModified ? current : newest
    );

    // Check if all versions have the same content
    const hashes = versions
      .map(v => v.fileInfo.hash)
      .filter(hash => hash !== undefined && hash !== "");

    if (hashes.length === versions.length && hashes.length > 1) {
      const firstHash = hashes[0];
      state.allIdentical = hashes.every(hash => hash === firstHash);
    } else {
      state.allIdentical = false;
    }
  }

  return state;
}

/**
 * Builds GlobalFileStates for multiple files from scan results.
 * Used by scanAllProjects to process scanned files from all projects.
 * Now filters files based on each project's manifest before building global states.
 * 
 * @param projects Array of project information
 * @param filesByProject Map of project name to scanned files
 * @returns Map of relative paths to GlobalFileStates
 */
export async function buildGlobalFileStates(
  projects: ProjectInfo[],
  filesByProject: Map<string, Map<string, FileInfo>>
): Promise<Map<string, GlobalFileState>> {
  const globalStates = new Map<string, GlobalFileState>();
  const allFiles = new Set<string>();
  
  // Load manifests for all projects
  const projectManifests = new Map<string, string[]>();
  for (const project of projects) {
    const manifest = await loadProjectManifest(project.path);
    projectManifests.set(project.name, manifest);
    logger.log(`[DEBUG] Project ${project.name} manifest: ${JSON.stringify(manifest)}`);
  }
  
  // Collect all unique file paths from scanned projects (excluding local files)
  // We need to consider all files that exist, then filter based on manifests later
  for (const files of filesByProject.values()) {
    for (const [relativePath, fileInfo] of files) {
      // Skip local files (these are never synchronized)
      if (fileInfo.isLocal) {
        continue;
      }
      allFiles.add(relativePath);
    }
  }
  
  // Process all files found in any project
  // This ensures we can delete files from projects that don't want them
  const filesToProcess = allFiles;

  // Build state for each file that passed manifest filtering
  for (const relativePath of filesToProcess) {
    const provider: FileDataProvider = {
      async getFileData(projectPath: string, relPath: string) {
        // Find project by path
        const project = findProjectByPath(projects, projectPath);
        if (!project) return null;
        
        // Get files for this project
        const files = filesByProject.get(project.name);
        const fileInfo = files?.get(relPath);
        if (!fileInfo) return null; // File doesn't exist in this project
        
        // All projects can contribute files to the global state
        // The manifest filtering happens later when determining sync actions
        
        // Get file stats
        const stats = await fs.stat(fileInfo.absolutePath);
        return {
          absolutePath: fileInfo.absolutePath,
          hash: fileInfo.hash || "",
          stats
        };
      }
    };
    
    const state = await buildGlobalFileState(projects, relativePath, provider);
    globalStates.set(relativePath, state);
  }
  
  // Update missingFrom for all states
  // Include all projects that want the file according to their manifests
  for (const [relativePath, state] of globalStates) {
    const projectsWantingFile = projects.filter(project => {
      const manifest = projectManifests.get(project.name) || [];
      return manifest.includes(relativePath);
    });
    
    state.missingFrom = projectsWantingFile
      .map(p => p.name)
      .filter(name => !state.versions.has(name));
  }
  
  return globalStates;
}