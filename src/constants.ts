import { resolve } from "path";
import { homedir } from "os";

/**
 * Maximum allowed size for markdown files (1MB in bytes)
 */
export const MAX_MD_SIZE = 1024 * 1024;

/**
 * Central repository path where all rules are stored
 */
export const CENTRAL_REPO_PATH = resolve(homedir(), "Developer/agent-rules");

/**
 * Rules subdirectory within the central repository
 */
export const CENTRAL_RULES_PATH = resolve(CENTRAL_REPO_PATH, "rules");

/**
 * Default configuration file path
 */
export const DEFAULT_CONFIG_PATH = resolve(
  homedir(),
  ".config/sync-rules-config.json",
);
