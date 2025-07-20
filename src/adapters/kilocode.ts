import { join, basename } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * Kilocode adapter - writes individual rule files to .kilocode/rules directory
 */
export const kilocodeAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];
  const rulesDir = join(projectPath, ".kilocode/rules");

  // Always create the rules directory first
  actions.push({
    type: "mkdir",
    path: rulesDir,
    recursive: true,
  });

  // Create write actions for each rule file
  for (const rule of rules) {
    // Use basename to flatten directory structure and avoid nesting issues
    const filename = basename(rule.path);

    actions.push({
      type: "write",
      path: join(rulesDir, filename),
      content: rule.content,
    });
  }

  return actions;
};
