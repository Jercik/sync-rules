import type { ProjectInfo } from "../discovery.ts";
import * as logger from "./core.ts";

/**
 * Creates a map of project names to project paths from an array of ProjectInfo.
 * This consolidates the duplicated logic found throughout the codebase.
 * 
 * @param projects Array of project information
 * @returns Map of project name to project path
 * @throws Error if duplicate project names are detected
 */
export function createProjectMap(projects: ProjectInfo[]): Map<string, string> {
  const projectMap = new Map<string, string>();
  
  for (const project of projects) {
    if (projectMap.has(project.name)) {
      const existingPath = projectMap.get(project.name);
      throw new Error(
        `Duplicate project name detected: "${project.name}" found at both "${existingPath}" and "${project.path}"`
      );
    }
    projectMap.set(project.name, project.path);
  }
  
  return projectMap;
}

/**
 * Creates a lookup map of project paths to ProjectInfo objects.
 * Useful when you need to find a project by its path.
 * 
 * @param projects Array of project information
 * @returns Map of project path to ProjectInfo
 */
export function createProjectPathMap(projects: ProjectInfo[]): Map<string, ProjectInfo> {
  return new Map(projects.map(p => [p.path, p]));
}

/**
 * Finds a project by name from an array of projects.
 * 
 * @param projects Array of project information
 * @param name The project name to find
 * @returns The ProjectInfo if found, undefined otherwise
 */
export function findProjectByName(projects: ProjectInfo[], name: string): ProjectInfo | undefined {
  return projects.find(p => p.name === name);
}

/**
 * Finds a project by path from an array of projects.
 * 
 * @param projects Array of project information
 * @param path The project path to find
 * @returns The ProjectInfo if found, undefined otherwise
 */
export function findProjectByPath(projects: ProjectInfo[], path: string): ProjectInfo | undefined {
  return projects.find(p => p.path === path);
}

/**
 * Validates that all projects have unique names.
 * Logs warnings for any duplicates found.
 * 
 * @param projects Array of project information
 * @returns True if all names are unique, false if duplicates exist
 */
export function validateUniqueProjectNames(projects: ProjectInfo[]): boolean {
  const nameToProjects = new Map<string, ProjectInfo[]>();
  
  // Group projects by name
  for (const project of projects) {
    const existing = nameToProjects.get(project.name) || [];
    existing.push(project);
    nameToProjects.set(project.name, existing);
  }
  
  // Check for duplicates
  let hasUniqueNames = true;
  for (const [name, projectList] of nameToProjects) {
    if (projectList.length > 1) {
      hasUniqueNames = false;
      const paths = projectList.map(p => p.path).join(", ");
      logger.warn(`Duplicate project name "${name}" found at: ${paths}`);
    }
  }
  
  return hasUniqueNames;
}