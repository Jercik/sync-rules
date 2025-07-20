import { resolve, normalize, relative, isAbsolute } from "path";
import { homedir } from "os";
import { realpathSync } from "fs";

/**
 * PathGuard - A utility class for secure path validation
 *
 * Encapsulates path normalization, symlink resolution, and validation against allowed root directories.
 * This class is designed to prevent path traversal attacks and ensure all file operations
 * occur within allowed directories.
 */
export class PathGuard {
  private allowedRoots: string[];

  /**
   * Creates a new PathGuard instance
   * @param allowedRoots - Array of absolute paths that are allowed as root directories
   */
  constructor(allowedRoots: string[]) {
    if (!allowedRoots || allowedRoots.length === 0) {
      throw new Error("At least one allowed root directory must be provided");
    }

    // Normalize and validate all allowed roots
    this.allowedRoots = allowedRoots.map((root) => {
      if (!isAbsolute(root)) {
        throw new Error(`Allowed root must be an absolute path: ${root}`);
      }
      // Normalize and remove trailing slashes
      const normalized = normalize(root);
      return normalized.endsWith("/") && normalized.length > 1
        ? normalized.slice(0, -1)
        : normalized;
    });
  }

  /**
   * Validates and normalizes a path, ensuring it's within allowed directories
   *
   * SECURITY NOTE: This method is critical for preventing path traversal attacks.
   * It performs the following security checks:
   * 1. Normalizes the path to prevent directory traversal sequences
   * 2. Resolves symlinks to prevent symlink-based escapes
   * 3. Verifies the final path is within allowed root directories
   *
   * @param input - The path to validate (supports ~ for home directory)
   * @returns The normalized and validated absolute path
   * @throws Error if path is invalid or outside allowed directories
   */
  validatePath(input: string): string {
    if (!input || input.trim() === "") {
      throw new Error("Invalid path: empty string");
    }

    // Expand home directory
    let expandedPath = input;
    if (input.startsWith("~")) {
      expandedPath = input.replace(/^~/, homedir());
    }

    // Resolve to absolute path first (allows .. in safe paths like ~/projects/../my-safe-dir)
    const absolutePath = resolve(expandedPath);
    const normalizedPath = normalize(absolutePath);

    // Resolve symlinks to prevent bypass attempts
    let realPath: string;
    try {
      realPath = realpathSync(normalizedPath);
    } catch {
      // If path doesn't exist yet, use the normalized path
      // This allows creating new files/directories
      realPath = normalizedPath;
    }

    // Check if path is within allowed directories
    if (!this.isInsideAllowedRoot(realPath)) {
      throw new Error("Path is outside allowed directories");
    }

    return realPath;
  }

  /**
   * Checks if a given path is inside one of the allowed root directories
   *
   * @param path - The absolute path to check
   * @returns true if the path is inside an allowed root, false otherwise
   */
  isInsideAllowedRoot(path: string): boolean {
    return this.allowedRoots.some((root) => {
      const relativePath = relative(root, path);
      // Path is inside root if relative path doesn't start with .. or /
      // and isn't an absolute path
      return (
        !relativePath.startsWith("..") &&
        !relativePath.startsWith("/") &&
        !isAbsolute(relativePath)
      );
    });
  }

  /**
   * Gets the list of allowed root directories
   * @returns A copy of the allowed roots array
   */
  getAllowedRoots(): string[] {
    return [...this.allowedRoots];
  }

  /**
   * Adds a new allowed root directory
   * @param root - The absolute path to add as an allowed root
   * @throws Error if the root is not an absolute path
   */
  addAllowedRoot(root: string): void {
    if (!isAbsolute(root)) {
      throw new Error(`Allowed root must be an absolute path: ${root}`);
    }
    // Normalize and remove trailing slashes
    const normalized = normalize(root);
    const normalizedRoot =
      normalized.endsWith("/") && normalized.length > 1
        ? normalized.slice(0, -1)
        : normalized;
    if (!this.allowedRoots.includes(normalizedRoot)) {
      this.allowedRoots.push(normalizedRoot);
    }
  }

  /**
   * Removes an allowed root directory
   * @param root - The absolute path to remove from allowed roots
   * @returns true if the root was removed, false if it wasn't found
   */
  removeAllowedRoot(root: string): boolean {
    // Normalize and remove trailing slashes
    const normalized = normalize(root);
    const normalizedRoot =
      normalized.endsWith("/") && normalized.length > 1
        ? normalized.slice(0, -1)
        : normalized;
    const index = this.allowedRoots.indexOf(normalizedRoot);
    if (index > -1) {
      this.allowedRoots.splice(index, 1);
      return true;
    }
    return false;
  }
}

/**
 * Factory function to create a PathGuard with default allowed roots
 * @param additionalRoots - Optional additional roots to include
 * @returns A new PathGuard instance
 */
export function createDefaultPathGuard(
  additionalRoots: string[] = [],
): PathGuard {
  const home = homedir();
  const cwd = process.cwd();
  const centralRepo = resolve(home, "Developer/agent-rules");

  const defaultRoots = [home, centralRepo, cwd, ...additionalRoots];
  return new PathGuard(defaultRoots);
}
