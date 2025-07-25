import { join, dirname } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * Cline adapter - writes individual rule files to .clinerules directory
 * Preserves directory structure to avoid name collisions
 */
export const clineAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];
  const rulesDir = join(projectPath, ".clinerules");

  // Always create the rules directory first
  actions.push({
    type: "mkdir",
    path: rulesDir,
    recursive: true,
  });

  // Track directories that need to be created
  const dirsToCreate = new Set<string>();

  // Collect all parent directories
  for (const rule of rules) {
    const relDir = dirname(rule.path);
    if (relDir !== ".") {
      // Add all parent directories in the path
      let currentDir = "";
      for (const part of relDir.split("/")) {
        currentDir = currentDir ? join(currentDir, part) : part;
        dirsToCreate.add(join(rulesDir, currentDir));
      }
    }
  }

  // Create mkdir actions for all needed directories (sorted for proper order)
  const sortedDirs = Array.from(dirsToCreate).sort();
  for (const dir of sortedDirs) {
    actions.push({
      type: "mkdir",
      path: dir,
      recursive: true,
    });
  }

  // Create write actions for each rule file (preserving directory structure)
  for (const rule of rules) {
    actions.push({
      type: "write",
      path: join(rulesDir, rule.path),
      content: rule.content,
    });
  }

  return actions;
};
