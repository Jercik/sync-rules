import type { Rule } from "./rules-fs.js";

/**
 * Concatenate rule contents with exactly one blank line between adjacent rules.
 * Boundary newlines from adjacent rules are normalized to a single "\n\n"
 * separator, including CRLF input.
 */
export function concatenateRules(rules: Rule[]): string {
  const [firstRule, ...remainingRules] = rules;
  if (firstRule === undefined) {
    return "";
  }

  let combinedContent = firstRule.content;

  for (const rule of remainingRules) {
    const normalizedCombinedContent = combinedContent.replace(
      /(?:\r?\n)+$/u,
      "",
    );
    const normalizedRuleContent = rule.content.replace(/^(?:\r?\n)+/u, "");

    if (normalizedCombinedContent === "") {
      combinedContent = normalizedRuleContent;
      continue;
    }

    if (normalizedRuleContent === "") {
      combinedContent = normalizedCombinedContent;
      continue;
    }

    combinedContent = `${normalizedCombinedContent}\n\n${normalizedRuleContent}`;
  }

  return combinedContent;
}
