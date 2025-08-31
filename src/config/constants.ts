import { resolve } from "node:path";
import { homedir, platform } from "node:os";
import { normalizePath } from "../utils/paths.js";

/**
 * Get the default configuration directory based on platform and XDG spec
 */
function getConfigDirectory(): string {
  // First priority: SYNC_RULES_CONFIG_DIR environment variable
  if (process.env.SYNC_RULES_CONFIG_DIR) {
    return process.env.SYNC_RULES_CONFIG_DIR;
  }

  // Second priority: XDG_CONFIG_HOME on Linux
  if (platform() === "linux" && process.env.XDG_CONFIG_HOME) {
    return resolve(process.env.XDG_CONFIG_HOME, "sync-rules");
  }

  // Default: ~/.sync-rules for simplicity across all platforms
  return resolve(homedir(), ".sync-rules");
}

/**
 * Default central rules directory
 * Priority order:
 * 1. SYNC_RULES_CENTRAL_REPO environment variable
 * 2. Default: ~/.sync-rules/rules
 */
export const DEFAULT_RULES_SOURCE =
  process.env.SYNC_RULES_CENTRAL_REPO || resolve(getConfigDirectory(), "rules");

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH =
  process.env.SYNC_RULES_CONFIG || resolve(getConfigDirectory(), "config.json");

/**
 * Get the rules source directory with proper priority order:
 * 1. Config file rulesSource field
 * 2. SYNC_RULES_CENTRAL_REPO environment variable
 * 3. Default: ~/.sync-rules/rules
 */
export function getRulesSource(configRulesSource?: string): string {
  // Priority 1: Config file rulesSource field
  if (configRulesSource) {
    // Use normalizePath to expand ~ and resolve to absolute path
    return normalizePath(configRulesSource);
  }

  // Priority 2 & 3: Environment variable or default
  return DEFAULT_RULES_SOURCE;
}
