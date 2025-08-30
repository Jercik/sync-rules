import { join } from "node:path";
import { matchesGlob } from "node:path";
import type { AdapterName } from "../config/config.ts";
import type { WriteAction } from "../utils/content.ts";
import type { Rule } from "../core/filesystem.ts";

/**
 * Input structure for adapter functions
 */
export type AdapterInput = {
  projectPath: string;
  rules: Rule[];
};

/**
 * Function signature for adapters
 */
export type AdapterFunction = (input: AdapterInput) => WriteAction[];

/**
 * Metadata describing adapter output characteristics
 */
export type AdapterMetadata =
  | { type: "single-file"; location: string }
  | { type: "multi-file"; directory: string };

/**
 * Complete adapter definition including function and metadata
 */
export type AdapterDefinition = {
  generateActions: AdapterFunction;
  meta: AdapterMetadata;
};

/**
 * Factory to create an adapter that writes all rules into a single markdown file
 */
function makeSingleFileAdapter(config: {
  filename: string;
  headerTitle: string;
  filterRules?: (rules: Rule[]) => Rule[];
}): AdapterFunction {
  const { filename, headerTitle, filterRules } = config;

  return ({ projectPath, rules }) => {
    const actions: WriteAction[] = [];
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
      path: join(projectPath, filename),
      content,
    });

    return actions;
  };
}

/**
 * Factory to create an adapter that writes individual rule files to a directory
 */
function makeMultiFileAdapter(dirName: string): AdapterFunction {
  return ({ projectPath, rules }) => {
    const actions: WriteAction[] = [];
    const rulesDir = join(projectPath, dirName);

    // Create write actions for each rule file
    // fs-extra will automatically create directories
    for (const rule of rules) {
      actions.push({
        path: join(rulesDir, rule.path),
        content: rule.content,
      });
    }

    return actions;
  };
}

/**
 * Registry of available adapters with metadata
 */
export const adapters: Record<AdapterName, AdapterDefinition> = {
  claude: {
    generateActions: makeSingleFileAdapter({
      filename: "CLAUDE.md",
      headerTitle: "CLAUDE.md - Rules for Claude Code",
      filterRules: (rules) =>
        rules.filter(
          (rule) =>
            ![
              "**/*memory-bank*", // Memory bank rules are injected via claudemb shell function
              "**/*memory-bank*/**", // Also match if memory-bank is in a directory name
              "**/*self-reflection*", // Self-reflection rule is not applicable to Claude
              "**/*self-reflection*/**", // Also match if self-reflection is in a directory name
            ].some((pattern) => matchesGlob(rule.path, pattern)),
        ),
    }),
    meta: { type: "single-file", location: "CLAUDE.md" },
  },
  cline: {
    generateActions: makeMultiFileAdapter(".clinerules"),
    meta: { type: "multi-file", directory: ".clinerules" },
  },
  gemini: {
    generateActions: makeSingleFileAdapter({
      filename: "GEMINI.md",
      headerTitle: "GEMINI.md - Rules for Gemini Code",
    }),
    meta: { type: "single-file", location: "GEMINI.md" },
  },
  kilocode: {
    generateActions: makeMultiFileAdapter(".kilocode/rules"),
    meta: { type: "multi-file", directory: ".kilocode/rules" },
  },
  codex: {
    generateActions: makeSingleFileAdapter({
      filename: "AGENTS.md",
      headerTitle: "AGENTS.md - Project docs for Codex CLI",
    }),
    meta: { type: "single-file", location: "AGENTS.md" },
  },
};
