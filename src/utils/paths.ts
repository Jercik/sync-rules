import { homedir } from "node:os";
import path from "node:path";

/**
 * Normalize a path by expanding `~` and resolving to an absolute path.
 * No boundary or permission checks are performed here.
 * @param input - The path to normalize (supports ~ for home directory)
 */
export function normalizePath(input: string): string {
  const expanded = input.startsWith("~")
    ? input.replace(/^~/u, homedir())
    : input;
  return path.resolve(expanded);
}

/**
 * Resolve a relative path inside a base directory, rejecting escapes.
 * - Rejects absolute input paths explicitly (e.g. "/etc/passwd").
 * - Uses path.resolve + path.relative to ensure the final path stays within baseDir.
 */
export function resolveInside(
  baseDirectory: string,
  relativePath: string,
): string {
  const full = path.resolve(baseDirectory, relativePath);
  const relative_ = path.relative(baseDirectory, full);
  if (relative_.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(
      `Refusing to write outside ${baseDirectory}: ${relativePath}`,
    );
  }
  return full;
}
