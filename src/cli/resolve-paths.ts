import { DEFAULT_RULES_SOURCE } from "../config/constants.js";
import { loadConfig } from "../config/loader.js";
import { ConfigNotFoundError, ensureError } from "../utils/errors.js";
import { normalizePath } from "../utils/paths.js";

type ResolvedPaths =
  | {
      status: "ok";
      configPath: string;
      rulesSource: string;
    }
  | {
      status: "error";
      configPath: string;
      rulesSource: string;
      error: Error;
    };

export async function resolvePaths(configPath: string): Promise<ResolvedPaths> {
  const normalizedPath = normalizePath(configPath);
  try {
    const config = await loadConfig(normalizedPath);
    return {
      status: "ok",
      configPath: normalizedPath,
      rulesSource: config.rulesSource,
    };
  } catch (error) {
    const error_ = ensureError(error);
    if (error_ instanceof ConfigNotFoundError) {
      return {
        status: "ok",
        configPath: normalizedPath,
        rulesSource: DEFAULT_RULES_SOURCE,
      };
    }
    return {
      status: "error",
      configPath: normalizedPath,
      rulesSource: DEFAULT_RULES_SOURCE,
      error: error_,
    };
  }
}

export function printPaths(paths: ResolvedPaths): void {
  console.log("NAME\tPATH");
  console.log(`CONFIG\t${paths.configPath}`);
  console.log(`RULES_SOURCE\t${paths.rulesSource}`);
}
