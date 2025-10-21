import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizePath } from "../utils/paths.js";
import { SyncError, ensureError } from "../utils/errors.js";
export type RunFlags = {
  dryRun: boolean;
};
export type WriteAction = {
  readonly path: string;
  readonly content: string;
};

export interface ExecutionReport {
  written: string[];
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
    const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
      await mkdir(dirname(path), { recursive: true });
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
