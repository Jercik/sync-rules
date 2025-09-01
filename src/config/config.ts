import { z } from "zod";
import { relative } from "node:path";
import { normalizePath } from "../utils/paths.js";
import { DEFAULT_RULES_SOURCE } from "./constants.js";

/**
 * AdapterName enum - supported AI coding assistant tools
 */
export const AdapterName = z.enum([
  "claude",
  "cline",
  "gemini",
  "kilocode",
  "codex",
]);

/**
 * Project configuration schema
 */
export const Project = z
  .object({
    path: z
      .string()
      .nonempty("Project path cannot be empty")
      .transform((path, ctx) => {
        try {
          return normalizePath(path);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid project path",
          });
          return z.NEVER;
        }
      }),
    rules: z
      .array(z.string())
      .nonempty("At least one rule must be specified")
      .describe(
        "POSIX-style glob patterns for selecting rule files. Use forward slashes even on Windows.",
      ),
    adapters: z.array(AdapterName).nonempty(),
  })
  .strict(); // Reject unknown properties

/**
 * Main configuration schema
 */
export const Config = z
  .object({
    rulesSource: z
      .string()
      .optional()
      .transform((v, ctx) => {
        try {
          return normalizePath(v ?? DEFAULT_RULES_SOURCE);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid rulesSource path" });
          return z.NEVER;
        }
      })
      .describe(
        "Path to the central rules directory. If not specified, defaults to system app data folder.",
      ),
    projects: z
      .array(Project)
      .nonempty("At least one project must be specified"),
  })
  .strict(); // Reject unknown properties

/**
 * Inferred types from Zod schemas
 */
export type AdapterName = z.infer<typeof AdapterName>;
export type Project = z.infer<typeof Project>;
export type Config = z.infer<typeof Config>;

/**
 * Parses and validates a JSON configuration string
 * @param jsonContent - The JSON string to parse
 * @returns The validated configuration object
 * @throws ZodError for validation issues
 */
export function parseConfig(jsonContent: string): Config {
  const data = JSON.parse(jsonContent);
  const result = Config.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}

/**
 * Find the most specific project configuration for a given path.
 * Handles nested projects correctly by returning the deepest matching path.
 * Uses path.relative for robust boundary checking to avoid partial matches.
 */
export function findProjectForPath(
  currentPath: string,
  config: Config,
): Project | undefined {
  const normalizedTarget = normalizePath(currentPath);

  // Find all matching projects with proper boundary checking
  const matches = config.projects.filter((project) => {
    // project.path is already normalized by Zod schema
    // Check if target is inside project (or is the project root itself)
    const rel = relative(project.path, normalizedTarget);
    // Empty string means same path, otherwise check that it doesn't escape
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
  });

  if (matches.length === 0) {
    return undefined;
  }

  // Return the most specific (longest path) match
  // This ensures /app/frontend is preferred over /app
  return matches.reduce((mostSpecific, current) => {
    // Paths are already normalized by Zod schema
    const currentLength = current.path.length;
    const mostSpecificLength = mostSpecific.path.length;
    return currentLength > mostSpecificLength ? current : mostSpecific;
  });
}
