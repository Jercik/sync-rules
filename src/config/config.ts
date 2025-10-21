import { z } from "zod";
import { isAbsolute, relative } from "node:path";
import { normalizePath } from "../utils/paths.js";
import { DEFAULT_RULES_SOURCE } from "./constants.js";

/**
 * Project configuration schema.
 * Each project specifies its path and glob patterns for selecting rules.
 */
export const Project = z
  .object({
    path: z
      .string()
      .nonempty("Project path cannot be empty")
      .transform(normalizePath),
    rules: z
      .array(z.string())
      .nonempty("At least one rule must be specified")
      .refine(
        (patterns) =>
          patterns.some((p) => {
            const t = p.trim();
            return t !== "" && !t.startsWith("!");
          }),
        {
          message:
            'rules must include at least one positive glob pattern (e.g., "**/*.md"); configs with only negative patterns are not allowed',
        },
      )
      .describe(
        "POSIX-style glob patterns for selecting rule files. Use forward slashes even on Windows.",
      ),
  })
  .strip();

/**
 * Main configuration schema.
 * Defines the central rules directory and all projects to sync.
 */
export const Config = z
  .object({
    rulesSource: z
      .string()
      .optional()
      .transform((v) => normalizePath(v ?? DEFAULT_RULES_SOURCE))
      .describe(
        "Path to the central rules directory. If not specified, defaults to system app data folder.",
      ),
    projects: z
      .array(Project)
      .nonempty("At least one project must be specified"),
  })
  .strip();

/**
 * Inferred types from Zod schemas
 */
export type Project = z.infer<typeof Project>;
export type Config = z.infer<typeof Config>;

/**
 * Parse and validate configuration from JSON string.
 *
 * @param jsonContent - Raw JSON configuration string
 * @returns Validated and normalized configuration object
 * @throws {ZodError} If validation fails (invalid structure, missing fields, etc.)
 */
export function parseConfig(jsonContent: string): Config {
  const data: unknown = JSON.parse(jsonContent);
  const result = Config.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}

/**
 * Find the most specific project configuration containing the given path.
 *
 * When multiple projects match (e.g., nested projects), returns the deepest one.
 * Uses path.relative for robust boundary checking to prevent partial matches.
 *
 * @param currentPath - Path to search for (can be a file or directory)
 * @param config - Configuration containing all projects
 * @returns The most specific matching project, or undefined if no match
 * @example
 * // Given projects: ["/app", "/app/frontend"]
 * findProjectForPath("/app/frontend/src", config)
 * // Returns project with path "/app/frontend" (not "/app")
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
    // Use isAbsolute to catch absolute results on Windows (different drive)
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });

  if (matches.length === 0) {
    return undefined;
  }

  // This ensures /app/frontend is preferred over /app
  return matches.reduce((mostSpecific, current) => {
    // Paths are already normalized by Zod schema
    const currentLength = current.path.length;
    const mostSpecificLength = mostSpecific.path.length;
    return currentLength > mostSpecificLength ? current : mostSpecific;
  });
}
