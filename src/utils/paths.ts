import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Normalize a path by expanding `~` and resolving to an absolute path.
 * No boundary or permission checks are performed here.
 * @param input - The path to normalize (supports ~ for home directory)
 */
export function normalizePath(input: string): string {
  const expanded = input.startsWith("~")
    ? input.replace(/^~/u, homedir())
    : input;
  return resolve(expanded);
}

/**
 * Resolve a relative path inside a base directory, rejecting escapes.
 * - Rejects absolute input paths explicitly (e.g. "/etc/passwd").
 * - Uses path.resolve + path.relative to ensure the final path stays within baseDir.
 */
export function resolveInside(baseDir: string, relPath: string): string {
  const full = resolve(baseDir, relPath);
  const rel = relative(baseDir, full);
  if (rel.startsWith("..") || isAbsolute(relPath)) {
    throw new Error(`Refusing to write outside ${baseDir}: ${relPath}`);
  }
  return full;
}
