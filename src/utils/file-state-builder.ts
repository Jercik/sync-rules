import type { ProjectInfo } from "../discovery.ts";
import type { GlobalFileState, FileVersion } from "../multi-sync.ts";
import type { FileInfo } from "../scan.ts";
import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import { findProjectByPath } from "./project-utils.ts";

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
  
  // Collect all unique file paths (excluding local files)
  for (const files of filesByProject.values()) {
    for (const [relativePath, fileInfo] of files) {
      if (!fileInfo.isLocal) {
        allFiles.add(relativePath);
      }
    }
  }

  // Build state for each unique file
  for (const relativePath of allFiles) {
    const provider: FileDataProvider = {
      async getFileData(projectPath: string, relPath: string) {
        // Find project by path
        const project = findProjectByPath(projects, projectPath);
        if (!project) return null;
        
        // Get files for this project
        const files = filesByProject.get(project.name);
        const fileInfo = files?.get(relPath);
        if (!fileInfo) return null;
        
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
  
  // Update missingFrom for all states (some projects might not have been scanned)
  const allProjectNames = projects.map(p => p.name);
  for (const state of globalStates.values()) {
    state.missingFrom = allProjectNames.filter(
      name => !state.versions.has(name)
    );
  }
  
  return globalStates;
}