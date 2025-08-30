import { single, under } from "./paths.ts";
import type { Rule } from "../core/rules-fs.ts";
import type { WriteAction } from "../utils/content.ts";

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
  planWrites: AdapterFunction;
  meta: AdapterMetadata;
};

/**
 * Creates an adapter function from metadata and optional configuration
 */
export function adapterFromMeta(
  meta: AdapterMetadata,
  opts?: {
    headerTitle?: string;
    filter?: (rules: Rule[]) => Rule[];
  },
): AdapterFunction {
  return ({ projectPath, rules }) => {
    const selected = opts?.filter ? opts.filter(rules) : [...rules];

    if (meta.type === "single-file") {
      const title = opts?.headerTitle ?? meta.location;
      const content = selected.length
        ? `# ${title}\n\nTo modify rules, edit the source ".md" files and run "sync-rules" to regenerate.\n\n` +
          selected.map((r) => r.content.trim()).join("\n\n---\n\n") +
          "\n"
        : `# ${title}\n\nNo rules configured.\n`;
      return [{ path: single(projectPath, meta.location), content }];
    }

    // multi-file
    return selected.map((r) => ({
      path: under(projectPath, meta.directory, r.path),
      content: r.content,
    }));
  };
}
