import { join } from "node:path";
import type { AdapterFunction } from "./index.ts";
import type { FSAction } from "../utils.ts";

export type SingleFileAdapterOptions = {
  filename: string;
  headerTitle: string; // Full header line after '# '
  filterRules?: (rules: Array<{ path: string; content: string }>) => Array<{
    path: string;
    content: string;
  }>;
};

/**
 * Factory to create an adapter that writes all rules into a single markdown file.
 * Adds a standard header, guidance line, separators, and trailing newline.
 */
export function makeSingleFileAdapter(
  options: SingleFileAdapterOptions,
): AdapterFunction {
  const { filename, headerTitle, filterRules } = options;

  const adapter: AdapterFunction = ({ projectPath, rules }) => {
    const actions: FSAction[] = [];

    const effectiveRules = filterRules ? filterRules(rules) : rules;

    let content: string;
    if (effectiveRules.length === 0) {
      content = `# ${headerTitle}\n\nNo rules configured.\n`;
    } else {
      const ruleContents = effectiveRules.map((rule) => rule.content.trim());
      content =
        `# ${headerTitle}\n\n` +
        "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.\n\n" +
        ruleContents.join("\n\n---\n\n") +
        "\n";
    }

    actions.push({
      type: "write",
      path: join(projectPath, filename),
      content,
    });

    return actions;
  };

  return adapter;
}
