import path from "node:path";
import envPaths from "env-paths";
import { normalizePath } from "../utils/paths.js";

const paths = envPaths("sync-rules", { suffix: "" });
const defaultConfigPath = path.resolve(paths.config, "config.json");

/**
 * Built-in default configuration file path, ignoring env overrides.
 */
export const BUILTIN_DEFAULT_CONFIG_PATH = defaultConfigPath;

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH = process.env.SYNC_RULES_CONFIG
  ? normalizePath(process.env.SYNC_RULES_CONFIG)
  : defaultConfigPath;

/**
 * Default rules source directory path
 * Uses the system-specific data directory via env-paths without a Node.js suffix.
 */
export const DEFAULT_RULES_SOURCE = path.resolve(paths.data, "rules");
