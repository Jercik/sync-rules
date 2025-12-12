import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import envPaths from "env-paths";
import { parseConfig } from "./config.js";
import { normalizePath } from "../utils/paths.js";
import { DEFAULT_CONFIG_PATH } from "./constants.js";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ensureError,
  isNodeError,
} from "../utils/errors.js";
import type { Config } from "./config.js";

const LEGACY_DEFAULT_CONFIG_PATH = resolve(
  envPaths("sync-rules").config,
  "config.json",
);

/**
 * Sample configuration template for new installations
 */
const SAMPLE_CONFIG = `{
  "global": ["global-rules/*.md"],
  "projects": [
    {
      "path": "/path/to/project",
      "rules": ["**/*.md"]
    }
  ]
}`;

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
  const configDir = dirname(normalizedPath);

  try {
    await mkdir(configDir, { recursive: true });

    // Use 'wx' flag for atomic exclusive create when not forcing
    // This prevents TOCTOU race conditions by atomically failing if file exists
    const writeFlags = force ? "w" : "wx";
    await writeFile(normalizedPath, SAMPLE_CONFIG, {
      encoding: "utf8",
      flag: writeFlags,
    });
  } catch (error) {
    const err = ensureError(error);
    if (isNodeError(err) && err.code === "EEXIST" && !force) {
      throw new Error(
        `Config file already exists at ${normalizedPath}. Use --force to overwrite`,
        { cause: err },
      );
    }
    throw new Error(
      `Failed to create config file at ${normalizedPath}: ${err.message}`,
      { cause: err },
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
  const normalizedPath = normalizePath(configPath);

  try {
    const configContent = await readFile(normalizedPath, "utf8");
    return parseConfig(configContent);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const isDefault = normalizedPath === normalizePath(DEFAULT_CONFIG_PATH);
      if (isDefault) {
        const legacyPath = normalizePath(LEGACY_DEFAULT_CONFIG_PATH);
        if (legacyPath !== normalizedPath) {
          try {
            const legacyContent = await readFile(legacyPath, "utf8");
            const parsedLegacy = parseConfig(legacyContent);

            // Best-effort automigration: copy legacy config to the new default location.
            try {
              await mkdir(dirname(normalizedPath), { recursive: true });
              await writeFile(normalizedPath, legacyContent, {
                encoding: "utf8",
                flag: "wx",
              });
            } catch {
              // Ignore migration errors; the legacy config is still usable.
            }

            return parsedLegacy;
          } catch (legacyError) {
            if (isNodeError(legacyError) && legacyError.code === "ENOENT") {
              throw new ConfigNotFoundError(normalizedPath, true);
            }
            throw new ConfigParseError(legacyPath, ensureError(legacyError));
          }
        }
      }
      throw new ConfigNotFoundError(normalizedPath, isDefault);
    }

    // Handle other errors (permissions, invalid JSON, parsing errors, etc.)
    throw new ConfigParseError(normalizedPath, ensureError(error));
  }
}
