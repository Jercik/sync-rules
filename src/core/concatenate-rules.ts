import type { Rule } from "./rules-fs.js";

/**
 * Concatenate rule contents with at most one newline between adjacent rules.
 * A newline is inserted only when neither side of the boundary already has one.
 */
export function concatenateRules(rules: Rule[]): string {
  const [firstRule, ...remainingRules] = rules;
  if (firstRule === undefined) {
    return "";
  }

  let combinedContent = firstRule.content;

  for (const rule of remainingRules) {
    if (combinedContent.endsWith("\n") || rule.content.startsWith("\n")) {
      combinedContent = `${combinedContent}${rule.content}`;
      continue;
    }

    combinedContent = `${combinedContent}\n${rule.content}`;
  }

  return combinedContent;
}
