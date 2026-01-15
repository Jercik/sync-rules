import { stat } from "node:fs/promises";
import { parseConfig } from "./config.js";
import { normalizePath } from "../utils/paths.js";
import { BUILTIN_DEFAULT_CONFIG_PATH, createConfigStore } from "./constants.js";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ensureError,
  isNodeError,
} from "../utils/errors.js";
import type { Config } from "./config.js";

/**
 * Sample configuration template for new installations
 */
const SAMPLE_CONFIG = {
  global: ["global-rules/*.md"],
  projects: [
    {
      path: "/path/to/project",
      rules: ["**/*.md"],
    },
  ],
};

/**
 * Creates a new configuration file with sample content
 *
 * @param configPath - Path where the config file should be created
 * @param force - If true, overwrites existing file. If false, fails if file exists.
 * @throws {Error} If the file cannot be created or already exists (when not forcing)
 */
export async function createSampleConfig(
  configPath: string,
  force = false,
): Promise<void> {
  const store = createConfigStore(configPath);
  const normalizedPath = normalizePath(store.path);

  try {
    if (!force) {
      try {
        await stat(normalizedPath);
        throw new Error(
          `Config file already exists at ${normalizedPath}. Use --force to overwrite`,
        );
      } catch (error) {
        if (!(isNodeError(error) && error.code === "ENOENT")) {
          throw error;
        }
      }
    }

    store.store = SAMPLE_CONFIG;
  } catch (error) {
    const error_ = ensureError(error);
    if (error_.message.includes("Config file already exists") && !force) {
      throw new Error(error_.message, { cause: error_ });
    }
    throw new Error(
      `Failed to create config file at ${normalizedPath}: ${error_.message}`,
      { cause: error_ },
    );
  }
}

/**
 * Loads and parses a configuration file.
 * Throws specific errors for missing or invalid configuration.
 *
 * @param configPath - Path to the JSON config file. `~` is supported.
 * @throws {ConfigNotFoundError} When the config file doesn't exist
 * @throws {ConfigParseError} When the config file cannot be parsed or is invalid
 */
export async function loadConfig(configPath: string): Promise<Config> {
  const store = createConfigStore(configPath);
  const normalizedPath = normalizePath(store.path);

  try {
    const configStat = await stat(normalizedPath);
    if (!configStat.isFile()) {
      throw new Error(`${normalizedPath} is not a file`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const isBuiltinDefault =
        normalizedPath === normalizePath(BUILTIN_DEFAULT_CONFIG_PATH);
      throw new ConfigNotFoundError(normalizedPath, isBuiltinDefault);
    }

    throw new ConfigParseError(normalizedPath, ensureError(error));
  }

  try {
    return parseConfig(JSON.stringify(store.store));
  } catch (error) {
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }
}
