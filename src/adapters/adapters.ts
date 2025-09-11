import { join, resolve } from "node:path";
import type { Rule } from "../core/rules-fs.js";
import type { WriteAction } from "../core/execution.js";
import { resolveInside } from "../utils/paths.js";

export type AdapterInput = {
  readonly projectPath: string;
  readonly rules: readonly Rule[];
};

export type AdapterFunction = (input: AdapterInput) => WriteAction[];

/**
 * Metadata describing adapter output characteristics
 */
export type SingleFileMeta = {
  type: "single-file";
  location: string;
};

export type AdapterMetadata =
  | SingleFileMeta
  | { type: "multi-file"; directory: string };

export type AdapterDefinition = {
  planWrites: AdapterFunction;
  meta: AdapterMetadata;
};

/**
 * Creates an adapter function from metadata and optional configuration
 */
export function createAdapter(meta: AdapterMetadata): AdapterFunction {
  return ({ projectPath, rules }) => {
    if (meta.type === "single-file") {
      if (rules.length === 0) return [];
      return [
        {
          path: join(projectPath, meta.location),
          content: singleFileContent(meta.location, rules),
        },
      ];
    }
    const base = resolve(projectPath, meta.directory);
    return rules.map((r) => ({
      path: resolveInside(base, r.path),
      content: r.content,
    }));
  };
}

function singleFileContent(filename: string, rules: readonly Rule[]): string {
  const header = `# ${filename}\n\nTo modify rules, edit the source ".md" files and run "sync-rules".\n\n`;
  const body = rules.map((r) => r.content).join("\n\n---\n\n");
  return header + body;
}
