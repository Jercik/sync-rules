import { join } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * Claude adapter - concatenates all rules into a single CLAUDE.md file
 */
export const claudeAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];

  // Transform memory-bank.md files to memory-bank-claude.md
  const transformedRules = rules.map((rule) => {
    if (rule.path.endsWith("memory-bank.md")) {
      // Replace memory-bank.md with memory-bank-claude.md in the path
      const transformedPath = rule.path.replace(
        /memory-bank\.md$/,
        "memory-bank-claude.md",
      );
      return { ...rule, path: transformedPath };
    }
    return rule;
  });

  // Create the CLAUDE.md content
  let content: string;

  if (transformedRules.length === 0) {
    // Handle empty rules with a minimal header
    content = "# CLAUDE.md - Rules for Claude Code\n\nNo rules configured.\n";
  } else {
    // Concatenate all rule contents with separators
    const ruleContents = transformedRules.map((rule) => rule.content.trim());
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
