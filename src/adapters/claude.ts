import { join, matchesGlob } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * List of patterns to ignore in Claude adapter.
 * These rules are handled separately or should not be included in CLAUDE.md.
 *
 * Uses Node.js native glob patterns.
 */
const IGNORED_PATTERNS = [
  "**/*memory-bank*", // Memory bank rules are injected via claudemb shell function
  "**/*memory-bank*/**", // Also match if memory-bank is in a directory name
  "**/*self-reflection*", // Self-reflection rule is not applicable to Claude
  "**/*self-reflection*/**", // Also match if self-reflection is in a directory name
] as const;

/**
 * Claude adapter - concatenates all rules into a single CLAUDE.md file
 */
export const claudeAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];

  // Filter out ignored rules
  const filteredRules = rules.filter((rule) => {
    // Skip any file that matches ignored patterns
    return !IGNORED_PATTERNS.some((pattern) => matchesGlob(rule.path, pattern));
  });

  // Create the CLAUDE.md content
  let content: string;

  if (filteredRules.length === 0) {
    // Handle empty rules with a minimal header
    content = "# CLAUDE.md - Rules for Claude Code\n\nNo rules configured.\n";
  } else {
    // Concatenate all rule contents with separators
    const ruleContents = filteredRules.map((rule) => rule.content.trim());
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
