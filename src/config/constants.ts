import { resolve } from "node:path";
import envPaths from "env-paths";
import { normalizePath } from "../utils/paths.js";

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH = process.env.SYNC_RULES_CONFIG
  ? normalizePath(process.env.SYNC_RULES_CONFIG)
  : resolve(
      // Note: envPaths("sync-rules") resolves to directories containing
      // the segment "sync-rules-nodejs" on all platforms. This is the
      // convention used by env-paths for Node.js scripts.
      envPaths("sync-rules").config,
      "config.json",
    );

/**
 * Default rules source directory path
 * Uses the system-specific data directory via env-paths
 */
export const DEFAULT_RULES_SOURCE = resolve(
  // See note above: envPaths("sync-rules") -> .../sync-rules-nodejs/...
  envPaths("sync-rules").data,
  "rules",
);
