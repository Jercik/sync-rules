import { writeFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizePath } from "../utils/paths.js";
import { SyncError, ensureError, isNodeError } from "../utils/errors.js";
export type RunFlags = {
  dryRun: boolean;
};
export type WriteAction = {
  readonly path: string;
  readonly content: string;
};

export interface ExecutionReport {
  written: string[];
  skipped: string[];
}

const DEFAULT_RUN_FLAGS: RunFlags = { dryRun: false };

/**
 * Execute write actions atomically with optional dry-run support.
 *
 * Uses atomic write strategy: writes to temporary file then renames to target path.
 * This ensures partial writes never corrupt existing files.
 *
 * @param actions - Array of write actions to execute
 * @param flags - Execution flags (e.g., `{ dryRun: true }` to skip actual writes)
 * @returns Report containing paths that were (or would be) written
 */
export async function executeActions(
  actions: WriteAction[],
  flags: RunFlags = DEFAULT_RUN_FLAGS,
): Promise<ExecutionReport> {
  const { dryRun } = flags;
  const report: ExecutionReport = {
    written: [],
    skipped: [],
  };

  if (actions.length === 0) {
    return report;
  }

  const normalized = actions.map((a) => ({
    ...a,
    path: normalizePath(a.path),
  }));

  for (const { path: filePath, content } of normalized) {
    if (dryRun) {
      report.written.push(filePath);
      continue;
    }

    const parentDirectory = path.dirname(filePath);

    // Check if parent directory exists
    try {
      const parentStat = await stat(parentDirectory);
      if (!parentStat.isDirectory()) {
        console.warn(
          `${parentDirectory} exists but is not a directory, skipping ${filePath}`,
        );
        report.skipped.push(filePath);
        continue;
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        console.warn(`${parentDirectory} does not exist, skipping ${filePath}`);
        report.skipped.push(filePath);
        continue;
      }
      throw new SyncError(
        `Failed to check directory ${parentDirectory}`,
        { action: "stat", path: parentDirectory },
        ensureError(error),
      );
    }

    const temporary = path.join(parentDirectory, `.${randomUUID()}.tmp`);
    try {
      // Atomic write: write to a temp file in the same directory, then rename
      await writeFile(temporary, content, "utf8");
      await rename(temporary, filePath);
      report.written.push(filePath);
    } catch (error) {
      // Best-effort cleanup: remove temp file if it exists
      await rm(temporary, { force: true }).catch(() => {
        /* ignore cleanup errors */
      });
      throw new SyncError(
        `Failed to write ${filePath}`,
        { action: "write", path: filePath },
        ensureError(error),
      );
    }
  }

  return report;
}
