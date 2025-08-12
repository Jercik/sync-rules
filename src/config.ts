import { z } from "zod";
import { normalizePath } from "./utils.ts";

// Using Zod's default error formatting - no custom error map needed

/**
 * Adapter enum - supported AI coding assistant tools
 */
export const Adapter = z.enum(["claude", "cline", "gemini", "kilocode"]);

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
    adapters: z.array(Adapter).nonempty(),
  })
  .strict(); // Reject unknown properties

/**
 * Main configuration schema
 */
export const Config = z
  .object({
    // $schema intentionally omitted to avoid dangling/placeholder schema URLs
    projects: z
      .array(Project)
      .nonempty("At least one project must be specified"),
  })
  .strict(); // Add strict to reject unknown root properties

/**
 * Inferred types from Zod schemas
 */
export type Adapter = z.infer<typeof Adapter>;
export type Project = z.infer<typeof Project>;
export type Config = z.infer<typeof Config>;

/**
 * Parses and validates a JSON configuration string
 * @param jsonContent - The JSON string to parse
 * @returns The validated configuration object
 * @throws Error for JSON parsing issues, ZodError for validation issues
 */
export function parseConfig(jsonContent: string): Config {
  let data;
  try {
    data = JSON.parse(jsonContent);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  const result = Config.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}
