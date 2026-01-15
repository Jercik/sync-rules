import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Config as ConfigSchema } from "./config.js";
import { normalizePath } from "../utils/paths.js";
import { BUILTIN_DEFAULT_CONFIG_PATH, createConfigStore } from "./constants.js";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ensureError,
  isNodeError,
} from "../utils/errors.js";
import type { Config as ConfigShape } from "./config.js";

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
  const normalizedPath = normalizePath(configPath);
  const configDirectory = path.dirname(normalizedPath);

  try {
    await mkdir(configDirectory, { recursive: true });
    const content = JSON.stringify(SAMPLE_CONFIG, undefined, "\t");
    const flag = force ? "w" : "wx";
    await writeFile(normalizedPath, content, { flag });
  } catch (error) {
    const error_ = ensureError(error);
    if (isNodeError(error_) && error_.code === "EEXIST" && !force) {
      throw new Error(
        `Config file already exists at ${normalizedPath}. Use --force to overwrite`,
        { cause: error_ },
      );
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
export async function loadConfig(configPath: string): Promise<ConfigShape> {
  const normalizedPath = normalizePath(configPath);
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

  let store: ReturnType<typeof createConfigStore>;
  try {
    store = createConfigStore(normalizedPath);
  } catch (error) {
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }

  try {
    const result = ConfigSchema.safeParse(store.store);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  } catch (error) {
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }
}
