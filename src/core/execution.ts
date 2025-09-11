import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      report.written.push(path);
    } catch (err) {
      throw new SyncError(
        `Failed to write ${path}`,
        { action: "write", path },
        ensureError(err),
      );
    }
  }

  return report;
}
