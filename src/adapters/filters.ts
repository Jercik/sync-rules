import { matchesGlob } from "node:path";
import type { Rule } from "../core/rules-fs.js";

/**
 * Filters rules for the Claude adapter, excluding memory-bank and self-reflection rules.
 */
export function claudeFilter(rules: readonly Rule[]): Rule[] {
  return [...rules].filter(
    (rule) =>
      ![
        "**/*memory-bank*", // Memory bank rules are injected via claudemb shell function
        "**/*memory-bank*/**", // Also match if memory-bank is in a directory name
        "**/*self-reflection*", // Self-reflection rule is not applicable to Claude
        "**/*self-reflection*/**", // Also match if self-reflection is in a directory name
      ].some((pattern) => matchesGlob(rule.path, pattern)),
  );
}
