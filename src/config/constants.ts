import { dirname, resolve } from "node:path";
import envPaths from "env-paths";
import Conf from "conf";
import { normalizePath } from "../utils/paths.js";

const configStore = new Conf({
  projectName: "sync-rules",
  projectSuffix: "",
  configName: "internal",
});

const defaultConfigDir = dirname(configStore.path);
const paths = envPaths("sync-rules", { suffix: "" });

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH = process.env.SYNC_RULES_CONFIG
  ? normalizePath(process.env.SYNC_RULES_CONFIG)
  : resolve(defaultConfigDir, "config.json");

/**
 * Default rules source directory path
 * Uses the system-specific data directory via env-paths without a Node.js suffix.
 */
export const DEFAULT_RULES_SOURCE = resolve(paths.data, "rules");
