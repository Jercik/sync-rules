import { resolve } from "path";
import { homedir } from "os";

/**
 * Schema URL for JSON editor support
 */
export const CONFIG_SCHEMA_URL = "https://example.com/sync-rules.schema.json";

/**
 * Maximum allowed size for markdown files (1MB in bytes)
 */
export const MAX_MD_SIZE = 1024 * 1024;

/**
 * Allowed root directories for project paths
 * Returns an array of absolute paths that projects are allowed to reside in
 */
export function getAllowedRoots(): string[] {
  const home = homedir();
  const centralRepo = resolve(home, "Developer/agent-rules");
  const cwd = process.cwd();

  return [home, centralRepo, cwd];
}
