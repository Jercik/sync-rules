import { readFile } from "node:fs/promises";
import { parseConfig } from "./config.ts";
import { normalizePath } from "../utils/paths.ts";
import { isNodeError, ensureError } from "../utils/logger.ts";
import { DEFAULT_CONFIG_PATH } from "./constants.ts";
import { ConfigNotFoundError, ConfigParseError } from "../utils/errors.ts";
import type { Config } from "./config.ts";

/**
 * Loads and parses a configuration file.
 * Throws specific errors for missing or invalid configuration.
 *
 * @param configPath - Path to the JSON config file. `~` is supported.
 * @returns The parsed and validated configuration object.
 * @throws {ConfigNotFoundError} When the config file doesn't exist
 * @throws {ConfigParseError} When the config file cannot be parsed or is invalid
 */
export async function loadConfig(configPath: string): Promise<Config> {
  const normalizedPath = normalizePath(configPath);

  try {
    const configContent = await readFile(normalizedPath, "utf8");
    return parseConfig(configContent);
  } catch (error) {
    // Handle file not found
    if (isNodeError(error) && error.code === "ENOENT") {
      const isDefault = normalizedPath === DEFAULT_CONFIG_PATH;
      throw new ConfigNotFoundError(normalizedPath, isDefault);
    }

    // Handle other errors (permissions, invalid JSON, parsing errors, etc.)
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }
}
