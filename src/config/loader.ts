import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseConfig } from "./config.ts";
import { normalizePath } from "../utils/paths.ts";
import { isNodeError } from "../utils/logger.ts";
import { DEFAULT_CONFIG_PATH } from "./constants.ts";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ensureError,
} from "../utils/errors.ts";
import type { Config } from "./config.ts";

/**
 * Sample configuration template for new installations
 */
const SAMPLE_CONFIG = `{
  // Optional: Specify a custom path for the central rules directory
  // "rulesSource": "~/.sync-rules/rules",
  "projects": [
    {
      "path": "/path/to/project",
      "adapters": ["claude"],
      "rules": ["**/*.md"]
    }
  ]
}`;

/**
 * Creates a new configuration file with sample content
 *
 * @param configPath - Path where the config file should be created
 * @throws {Error} If the file cannot be created
 */
export async function createSampleConfig(configPath: string): Promise<void> {
  const normalizedPath = normalizePath(configPath);
  const configDir = dirname(normalizedPath);

  try {
    // Ensure the directory exists
    await mkdir(configDir, { recursive: true });

    // Write the sample config (already formatted as JSON string with comments)
    await writeFile(normalizedPath, SAMPLE_CONFIG, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to create config file at ${normalizedPath}: ${ensureError(error).message}`,
    );
  }
}

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
      const isDefault = normalizedPath === normalizePath(DEFAULT_CONFIG_PATH);
      throw new ConfigNotFoundError(normalizedPath, isDefault);
    }

    // Handle other errors (permissions, invalid JSON, parsing errors, etc.)
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }
}
