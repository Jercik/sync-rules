import { homedir } from "node:os";
import path from "node:path";

/**
 * Normalize a path by expanding `~` and resolving to an absolute path.
 * No boundary or permission checks are performed here.
 * @param input - The path to normalize (supports ~ for home directory)
 */
export function normalizePath(input: string): string {
  const expanded = input.startsWith("~")
    ? input.replace(/^~(?=$|[\\/])/u, homedir())
    : input;
  return path.resolve(expanded);
}

/**
 * Resolve a relative path inside a base directory, rejecting escapes.
 * - Rejects absolute input paths explicitly (e.g. "/etc/passwd").
 * - Uses path.relative to ensure the final path stays within baseDir.
 */
export function resolveInside(
  baseDirectory: string,
  relativePath: string,
): string {
  const base = path.resolve(baseDirectory);
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to write outside ${base}: ${relativePath}`);
  }

  const full = path.resolve(base, relativePath);
  const relative_ = path.relative(base, full);
  if (relative_ === "") {
    // Empty relative means baseDirectory and full are the same path.
    return full;
  }
  if (path.isAbsolute(relative_)) {
    throw new Error(`Refusing to write outside ${base}: ${relativePath}`);
  }
  if (relative_ === ".." || relative_.startsWith(`..${path.sep}`)) {
    throw new Error(`Refusing to write outside ${base}: ${relativePath}`);
  }
  return full;
}
