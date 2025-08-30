import { resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Central repository path where all rules are stored
 * Can be overridden via SYNC_RULES_CENTRAL_REPO environment variable
 */
export const CENTRAL_REPO_PATH =
  process.env.SYNC_RULES_CENTRAL_REPO ||
  resolve(homedir(), "Developer/agent-rules");

/**
 * Rules subdirectory within the central repository
 */
export const CENTRAL_RULES_DIR = resolve(CENTRAL_REPO_PATH, "rules");

/**
 * Default configuration file path
 */
export const DEFAULT_CONFIG_PATH = resolve(
  homedir(),
  ".config/sync-rules-config.json",
);
