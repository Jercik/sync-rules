import { writeFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  flags: RunFlags = { dryRun: false },
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

  for (const { path, content } of normalized) {
    if (dryRun) {
      report.written.push(path);
      continue;
    }

    const parentDir = dirname(path);

    // Check if parent directory exists
    try {
      const parentStat = await stat(parentDir);
      if (!parentStat.isDirectory()) {
        console.warn(
          `${parentDir} exists but is not a directory, skipping ${path}`,
        );
        report.skipped.push(path);
        continue;
      }
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        console.warn(`${parentDir} does not exist, skipping ${path}`);
        report.skipped.push(path);
        continue;
      }
      throw new SyncError(
        `Failed to check directory ${parentDir}`,
        { action: "stat", path: parentDir },
        ensureError(err),
      );
    }

    const tmp = join(parentDir, `.${randomUUID()}.tmp`);
    try {
      // Atomic write: write to a temp file in the same directory, then rename
      await writeFile(tmp, content, "utf8");
      await rename(tmp, path);
      report.written.push(path);
    } catch (err) {
      // Best-effort cleanup: remove temp file if it exists
      await rm(tmp, { force: true }).catch(() => {
        /* ignore cleanup errors */
      });
      throw new SyncError(
        `Failed to write ${path}`,
        { action: "write", path },
        ensureError(err),
      );
    }
  }

  return report;
}
