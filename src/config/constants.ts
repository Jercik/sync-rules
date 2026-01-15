import path from "node:path";
import Conf from "conf";
import envPaths from "env-paths";
import { normalizePath } from "../utils/paths.js";

/**
 * Built-in default configuration file path, ignoring env overrides.
 */
const configPaths = envPaths("sync-rules", { suffix: "" });
export const BUILTIN_DEFAULT_CONFIG_PATH = path.resolve(
  configPaths.config,
  "config.json",
);

/**
 * Default configuration file path
 * Can be overridden via SYNC_RULES_CONFIG environment variable
 */
export const DEFAULT_CONFIG_PATH = process.env.SYNC_RULES_CONFIG
  ? normalizePath(process.env.SYNC_RULES_CONFIG)
  : BUILTIN_DEFAULT_CONFIG_PATH;

/**
 * Default rules source directory path
 * Uses the system-specific data directory via env-paths without a Node.js suffix.
 */
const dataPaths = envPaths("sync-rules", { suffix: "" });
export const DEFAULT_RULES_SOURCE = path.resolve(dataPaths.data, "rules");

export function createConfigStore(configPath: string): Conf {
  const normalizedPath = normalizePath(configPath);
  const extension = path.extname(normalizedPath);
  const configName = path.basename(normalizedPath, extension);
  const fileExtension = extension ? extension.slice(1) : "";
  return new Conf({
    cwd: path.dirname(normalizedPath),
    configName,
    fileExtension,
    projectName: "sync-rules",
    projectSuffix: "",
  });
}
