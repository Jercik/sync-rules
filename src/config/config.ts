import { z } from "zod";
import path from "node:path";
import { normalizePath } from "../utils/paths.js";
import { DEFAULT_RULES_SOURCE } from "./constants.js";
import { HARNESS_NAMES } from "../core/harness-registry.js";
import type { HarnessName } from "../core/harness-registry.js";

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
 * Validates that a glob pattern array (when provided) contains at least one
 * non-empty, non-negation pattern.
 */
function hasPositiveGlob(patterns: string[] | undefined): boolean {
  return (
    patterns === undefined ||
    patterns.some((p) => {
      const t = p.trim();
      return t !== "" && !t.startsWith("!");
    })
  );
}

const GlobalOverrides = z
  .record(z.string(), z.array(z.string()))
  .optional()
  .superRefine((overrides, context) => {
    if (overrides === undefined) return;
    if (Object.keys(overrides).length === 0) {
      context.addIssue({
        code: "custom",
        message:
          "globalOverrides cannot be empty when provided; omit the field instead",
      });
      return;
    }
    for (const key of Object.keys(overrides)) {
      if (!HARNESS_NAMES.includes(key as HarnessName)) {
        context.addIssue({
          code: "custom",
          message: `Unknown harness "${key}". Valid harness names: ${HARNESS_NAMES.join(", ")}`,
          path: [key],
        });
        continue;
      }
      const patterns = overrides[key];
      if (!patterns || patterns.length === 0) {
        context.addIssue({
          code: "custom",
          message: `globalOverrides.${key} cannot be empty when provided`,
          path: [key],
        });
        continue;
      }
      if (!hasPositiveGlob(patterns)) {
        context.addIssue({
          code: "custom",
          message: `globalOverrides.${key} must include at least one positive glob pattern`,
          path: [key],
        });
      }
    }
  })
  .describe(
    "Optional per-harness override globs. Keys must be valid harness names.",
  );

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
    global: z
      .array(z.string())
      .optional()
      .refine((patterns) => patterns === undefined || patterns.length > 0, {
        message: "global cannot be empty when provided",
      })
      .refine((patterns) => hasPositiveGlob(patterns), {
        message:
          'global must include at least one positive glob pattern (e.g., "global-rules/*.md") when provided',
      })
      .describe(
        "Optional POSIX-style globs for global rules to sync to tool-specific global files.",
      ),
    globalOverrides: GlobalOverrides,
    projects: z
      .array(Project)
      .optional()
      .refine((projects) => projects === undefined || projects.length > 0, {
        message:
          "projects cannot be empty when provided; omit the field instead",
      }),
  })
  .strip()
  .refine(
    (config) => {
      const hasGlobal = config.global !== undefined;
      const hasOverrides = config.globalOverrides !== undefined;
      const hasProjects =
        config.projects !== undefined && config.projects.length > 0;
      return hasGlobal || hasOverrides || hasProjects;
    },
    {
      message:
        "Config must specify at least one of: global, globalOverrides, or projects",
    },
  );

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
  const projects = config.projects ?? [];

  // Find all matching projects with proper boundary checking
  const matches = projects.filter((project) => {
    // project.path is already normalized by Zod schema
    // Check if target is inside project (or is the project root itself)
    const relative_ = path.relative(project.path, normalizedTarget);
    // Empty string means same path, otherwise check that it doesn't escape
    // Use isAbsolute to catch absolute results on Windows (different drive)
    return (
      relative_ === "" ||
      (!relative_.startsWith("..") && !path.isAbsolute(relative_))
    );
  });

  if (matches.length === 0) {
    return undefined;
  }

  // This ensures /app/frontend is preferred over /app
  let mostSpecific = matches[0];
  for (const current of matches) {
    // Paths are already normalized by Zod schema
    const currentLength = current.path.length;
    const mostSpecificLength = mostSpecific ? mostSpecific.path.length : 0;
    if (currentLength > mostSpecificLength) {
      mostSpecific = current;
    }
  }
  return mostSpecific;
}
