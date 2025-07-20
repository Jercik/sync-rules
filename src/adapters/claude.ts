import { join } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * Claude adapter - concatenates all rules into a single CLAUDE.md file
 */
export const claudeAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];

  // Create the CLAUDE.md content
  let content: string;

  if (rules.length === 0) {
    // Handle empty rules with a minimal header
    content = "# CLAUDE.md - Rules for Claude Code\n\nNo rules configured.\n";
  } else {
    // Concatenate all rule contents with separators
    const ruleContents = rules.map((rule) => rule.content.trim());
    content =
      "# CLAUDE.md - Rules for Claude Code\n\n" +
      "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.\n\n" +
      ruleContents.join("\n\n---\n\n") +
      "\n";
  }

  // Create a write action for CLAUDE.md
  actions.push({
    type: "write",
    path: join(projectPath, "CLAUDE.md"),
    content,
  });

  return actions;
};
