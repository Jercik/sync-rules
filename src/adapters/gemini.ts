import { join } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

/**
 * Gemini adapter - concatenates all rules into a single GEMINI.md file
 */
export const geminiAdapter: AdapterFunction = ({ projectPath, rules }) => {
  const actions: FSAction[] = [];

  // Create the GEMINI.md content
  let content: string;

  if (rules.length === 0) {
    // Handle empty rules with a minimal header
    content = "# GEMINI.md - Rules for Gemini Code\n\nNo rules configured.\n";
  } else {
    // Concatenate all rule contents with separators
    const ruleContents = rules.map((rule) => rule.content.trim());
    content =
      "# GEMINI.md - Rules for Gemini Code\n\n" +
      "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.\n\n" +
      ruleContents.join("\n\n---\n\n") +
      "\n";
  }

  // Create a write action for GEMINI.md
  actions.push({
    type: "write",
    path: join(projectPath, "GEMINI.md"),
    content,
  });

  return actions;
};
