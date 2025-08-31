import { z } from "zod";
import isPathInside from "is-path-inside";
import stripJsonComments from "strip-json-comments";
import { normalizePath } from "../utils/paths.ts";

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
    rules: z.array(z.string()).nonempty("At least one rule must be specified"),
    adapters: z.array(AdapterName).nonempty(),
  })
  .strict(); // Reject unknown properties

/**
 * Main configuration schema
 */
export const Config = z
  .object({
    // $schema intentionally omitted to avoid dangling/placeholder schema URLs
    rulesSource: z
      .string()
      .optional()
      .describe("Path to the central rules directory"),
    projects: z
      .array(Project)
      .nonempty("At least one project must be specified"),
  })
  .strict(); // Add strict to reject unknown root properties

/**
 * Inferred types from Zod schemas
 */
export type AdapterName = z.infer<typeof AdapterName>;
export type Project = z.infer<typeof Project>;
export type Config = z.infer<typeof Config>;

/**
 * Parses and validates a JSON configuration string
 * @param jsonContent - The JSON string to parse (supports JSON with comments)
 * @returns The validated configuration object
 * @throws ZodError for validation issues
 */
export function parseConfig(jsonContent: string): Config {
  // Strip comments before parsing to support JSONC format
  const cleanJson = stripJsonComments(jsonContent);
  const data = JSON.parse(cleanJson);
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
    // Exact match
    if (normalizedTarget === project.path) {
      return true;
    }

    // Check if target is inside project using is-path-inside
    // This correctly handles path boundaries and avoids /app matching /app-data
    return isPathInside(normalizedTarget, project.path);
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
