import type { GlobalFileState, FileVersion, UserDecision } from "../multi-sync.ts";
import { select } from "./prompts.ts";
import * as logger from "./core.ts";

/**
 * Interface for file decision strategies.
 * Each strategy handles a specific scenario for file synchronization decisions.
 */
export interface FileDecisionStrategy {
  /**
   * Checks if this strategy applies to the given file state.
   */
  matches(fileState: GlobalFileState): boolean;
  
  /**
   * Prompts the user and returns their decision for this file.
   */
  getDecision(fileState: GlobalFileState): Promise<UserDecision>;
}

/**
 * Strategy for files that exist in only one project.
 */
export class SingleProjectStrategy implements FileDecisionStrategy {
  matches(fileState: GlobalFileState): boolean {
    return fileState.versions.size === 1 && fileState.missingFrom.length > 0;
  }
  
  async getDecision(fileState: GlobalFileState): Promise<UserDecision> {
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
}

/**
 * Strategy for files that are identical across some projects but missing from others.
 */
export class IdenticalWithMissingStrategy implements FileDecisionStrategy {
  matches(fileState: GlobalFileState): boolean {
    return fileState.versions.size > 1 && 
           fileState.allIdentical === true && 
           fileState.missingFrom.length > 0;
  }
  
  async getDecision(fileState: GlobalFileState): Promise<UserDecision> {
    const sourceProject = fileState.newestVersion!.projectName;
    
    const options = [
      {
        label: `Add to ${fileState.missingFrom.length} missing project(s) using version from ${sourceProject}`,
        value: "add" as const,
      },
      {
        label: `Delete from all ${fileState.versions.size} projects that have it`,
        value: "delete-all" as const,
      },
      { label: "Skip this file", value: "skip" as const },
    ];
    
    const choice = await select(
      `File ${fileState.relativePath} is identical in ${fileState.versions.size} projects but missing from ${fileState.missingFrom.length}. What should be done?`,
      options,
    );
    
    if (choice === "add") {
      return { action: "use-newest", confirmed: true };
    } else if (choice === "delete-all") {
      return { action: "delete-all", confirmed: true };
    } else {
      logger.log(`Skipping file: ${fileState.relativePath}`);
      return { action: "skip", confirmed: true };
    }
  }
}

/**
 * Helper type for grouped file versions.
 */
interface VersionGroup {
  projects: string[];
  newestInGroup: FileVersion;
}

/**
 * Strategy for files with different versions across projects.
 */
export class DifferentVersionsStrategy implements FileDecisionStrategy {
  matches(fileState: GlobalFileState): boolean {
    return fileState.versions.size > 1 && fileState.allIdentical !== true;
  }
  
  async getDecision(fileState: GlobalFileState): Promise<UserDecision> {
    const groups = this.groupVersionsByHash(fileState);
    const sortedGroups = this.sortGroupsByTimestamp(groups);
    
    const versionOptions = sortedGroups.map((group, index) => ({
      label: `Use version ${index + 1} (from ${group.newestInGroup.projectName}, used in ${group.projects.length} project${group.projects.length > 1 ? "s" : ""})`,
      value: `use-group-${index}` as const,
    }));
    
    const options = [
      ...versionOptions,
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
    } else if (choice === "delete-all") {
      return { action: "delete-all", confirmed: true };
    } else if (choice.startsWith("use-group-")) {
      const groupIndex = parseInt(choice.replace("use-group-", ""), 10);
      const selectedGroup = sortedGroups[groupIndex];
      if (!selectedGroup) {
        throw new Error(`Invalid group index: ${groupIndex}`);
      }
      return {
        action: "use-specific",
        sourceProject: selectedGroup.newestInGroup.projectName,
        confirmed: true,
      };
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error("Unexpected choice value");
  }
  
  private groupVersionsByHash(fileState: GlobalFileState): Map<string, VersionGroup> {
    const groups = new Map<string, VersionGroup>();
    const versions = Array.from(fileState.versions.values());
    
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
    
    return groups;
  }
  
  private sortGroupsByTimestamp(groups: Map<string, VersionGroup>): VersionGroup[] {
    return Array.from(groups.values()).sort(
      (a, b) =>
        b.newestInGroup.lastModified.getTime() -
        a.newestInGroup.lastModified.getTime(),
    );
  }
}

/**
 * Default strategy that returns the newest version.
 * This is used when no other strategy matches.
 */
export class DefaultStrategy implements FileDecisionStrategy {
  matches(fileState: GlobalFileState): boolean {
    // Always matches as a fallback
    return true;
  }
  
  async getDecision(fileState: GlobalFileState): Promise<UserDecision> {
    return { action: "use-newest", confirmed: true };
  }
}

/**
 * The main decision context that uses strategies to get user decisions.
 */
export class FileDecisionContext {
  private strategies: FileDecisionStrategy[];
  
  constructor() {
    // Order matters: more specific strategies come first
    this.strategies = [
      new SingleProjectStrategy(),
      new IdenticalWithMissingStrategy(),
      new DifferentVersionsStrategy(),
      new DefaultStrategy(), // Must be last as it always matches
    ];
  }
  
  /**
   * Gets the user decision for a file using the appropriate strategy.
   */
  async getDecision(fileState: GlobalFileState): Promise<UserDecision> {
    for (const strategy of this.strategies) {
      if (strategy.matches(fileState)) {
        return strategy.getDecision(fileState);
      }
    }
    
    // This should never happen as DefaultStrategy always matches
    throw new Error("No strategy matched the file state");
  }
}

/**
 * Prompts the user for a decision about what to do with a file that has differences.
 * This is the main entry point that replaces the original complex function.
 */
export async function promptUserForFileDecision(
  fileState: GlobalFileState,
): Promise<UserDecision> {
  const context = new FileDecisionContext();
  return context.getDecision(fileState);
}