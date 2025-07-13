import type { ProjectInfo } from "../discovery.ts";
import type { GlobalFileState, FileVersion } from "../multi-sync.ts";
import { getFileHash } from "./core.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as logger from "./core.ts";
import { buildGlobalFileState, type FileDataProvider } from "./file-state-builder.ts";

/**
 * Scans a single file across all projects and builds its global state.
 * 
 * This utility function is useful for scanning specific files (like manifest.json)
 * that may not match the regular .md constraint used by the main scan function.
 * 
 * @param projects Array of project information
 * @param relativePath The relative path of the file to scan (e.g., '.kilocode/manifest.json')
 * @returns GlobalFileState object containing the file's state across all projects
 */
export async function scanSingleFileAcrossProjects(
  projects: ProjectInfo[],
  relativePath: string
): Promise<GlobalFileState> {
  // Create a file data provider that checks for the file in each project
  const provider: FileDataProvider = {
    async getFileData(projectPath: string, relPath: string) {
      const absolutePath = path.join(projectPath, relPath);
      try {
        const stats = await fs.stat(absolutePath);
        const hash = await getFileHash(absolutePath);
        return { absolutePath, hash, stats };
      } catch {
        // File doesn't exist or can't be accessed
        return null;
      }
    }
  };
  
  // Use the consolidated state builder
  return buildGlobalFileState(projects, relativePath, provider);
}