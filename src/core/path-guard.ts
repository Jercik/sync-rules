import { normalize, isAbsolute } from "node:path";
import isPathInside from "is-path-inside";
import { CENTRAL_REPO_PATH } from "../config/constants.ts";
import { normalizePath } from "../utils/paths.ts";
import type { Config } from "../config/config.ts";

/**
 * Normalizes a root path - removes trailing slashes and normalizes
 */
function normalizeRoot(root: string): string {
  const normalized = normalize(root);
  return normalized.endsWith("/") && normalized.length > 1
    ? normalized.slice(0, -1)
    : normalized;
}

/**
 * Type for the path validation function returned by createPathGuard
 */
export type PathValidator = (input: string) => string;

/**
 * Type for the PathGuard object
 */
export interface PathGuard {
  validatePath: PathValidator;
  getAllowedRoots(): string[];
  isInsideAllowedRoot(path: string): boolean;
}

/**
 * Creates an immutable path guard that validates paths against allowed roots.
 */
export function createPathGuard(allowedRoots: string[]): PathGuard {
  if (!allowedRoots || allowedRoots.length === 0) {
    throw new Error("At least one allowed root directory must be provided");
  }

  // Validate and normalize roots (immutable)
  const normalizedRoots = Object.freeze(
    allowedRoots.map((root) => {
      if (!isAbsolute(root)) {
        throw new Error(`Allowed root must be an absolute path: ${root}`);
      }
      return normalizeRoot(root);
    }),
  );

  /**
   * Helper function that checks if a path is valid and inside allowed roots.
   * Returns an object with the result and normalized path.
   */
  const checkPath = (
    targetPath: string,
  ): { valid: boolean; normalizedPath?: string; error?: string } => {
    if (!targetPath || targetPath.trim() === "") {
      return { valid: false, error: "Invalid path: empty string" };
    }

    // Use the centralized normalizePath utility for tilde expansion and resolution
    const normalizedPath = normalizePath(targetPath);

    // Check if path is inside any allowed root using logical path checking
    const isAllowed = normalizedRoots.some((root) => {
      return isPathInside(normalizedPath, root) || normalizedPath === root;
    });

    if (!isAllowed) {
      return {
        valid: false,
        normalizedPath,
        error: "Path is outside allowed directories",
      };
    }

    return { valid: true, normalizedPath };
  };

  // Core validation function that throws errors
  const validatePath: PathValidator = (targetPath: string): string => {
    const result = checkPath(targetPath);
    if (!result.valid) {
      throw new Error(result.error);
    }
    return result.normalizedPath!;
  };

  // Return an immutable PathGuard object
  return Object.freeze({
    validatePath,

    getAllowedRoots(): string[] {
      return [...normalizedRoots];
    },

    isInsideAllowedRoot(path: string): boolean {
      const result = checkPath(path);
      return result.valid;
    },
  });
}

/**
 * Creates a PathGuard from a Config object.
 * Project paths are already normalized by Zod validation.
 */
export function createPathGuardFromConfig(config: Config): PathGuard {
  const projectRoots = config.projects.map((p) => p.path);
  const defaultRoots = [CENTRAL_REPO_PATH, ...projectRoots];
  return createPathGuard(defaultRoots);
}
