import type { Rule } from "./rules-fs.js";

/**
 * Concatenate rule contents with exactly one blank line between adjacent rules.
 * Trailing newlines from a previous rule and leading newlines from the next rule
 * are normalized to a single "\n\n" separator.
 */
export function concatenateRules(rules: Rule[]): string {
  const [firstRule, ...remainingRules] = rules;
  if (firstRule === undefined) {
    return "";
  }

  let combinedContent = firstRule.content;

  for (const rule of remainingRules) {
    combinedContent = combinedContent.replace(/\n+$/u, "");
    const normalizedRuleContent = rule.content.replace(/^\n+/u, "");
    combinedContent = `${combinedContent}\n\n${normalizedRuleContent}`;
  }

  return combinedContent;
}
