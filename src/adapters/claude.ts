import { join, matchesGlob } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";
import { makeSingleFileAdapter } from "./shared.ts";

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
export const claudeAdapter: AdapterFunction = makeSingleFileAdapter({
  filename: "CLAUDE.md",
  headerTitle: "CLAUDE.md - Rules for Claude Code",
  filterRules: (rules) =>
    rules.filter(
      (rule) =>
        !IGNORED_PATTERNS.some((pattern) => matchesGlob(rule.path, pattern)),
    ),
});
