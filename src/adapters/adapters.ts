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
  title?: string;
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
  return ({ projectPath, rules }) =>
    meta.type === "single-file"
      ? [
          {
            path: join(projectPath, meta.location),
            content:
              `# ${meta.title ?? meta.location}\n\n` +
              (rules.length
                ? 'To modify rules, edit the source ".md" files and run "sync-rules".\n\n' +
                  rules.map((r) => r.content.trim()).join("\n\n---\n\n") +
                  "\n"
                : "No rules configured.\n"),
          },
        ]
      : rules.map((r) => ({
          path: resolveInside(resolve(projectPath, meta.directory), r.path),
          content: r.content,
        }));
}
