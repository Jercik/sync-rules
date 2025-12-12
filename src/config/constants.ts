import { resolve } from "node:path";
import envPaths from "env-paths";
import { normalizePath } from "../utils/paths.js";

const paths = envPaths("sync-rules", { suffix: "" });
const legacyPaths = envPaths("sync-rules");
const defaultConfigPath = resolve(paths.config, "config.json");

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH = process.env.SYNC_RULES_CONFIG
  ? normalizePath(process.env.SYNC_RULES_CONFIG)
  : defaultConfigPath;

/**
 * Legacy configuration file path used before v5.1.1.
 * Probed for backwards compatibility when default config is missing.
 */
export const LEGACY_CONFIG_PATH = resolve(legacyPaths.config, "config.json");

/**
 * Default rules source directory path
 * Uses the system-specific data directory via env-paths without a Node.js suffix.
 */
export const DEFAULT_RULES_SOURCE = resolve(paths.data, "rules");
