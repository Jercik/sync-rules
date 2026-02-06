import type { Rule } from "./rules-fs.js";

/**
 * Concatenate rule contents separated by a Markdown horizontal rule.
 * Preserves structural boundaries between rule files so adjacent
 * Markdown headings or prose cannot merge.
 */
export function concatenateRules(rules: Rule[]): string {
  return rules.map((r) => r.content).join("\n\n---\n\n");
}
