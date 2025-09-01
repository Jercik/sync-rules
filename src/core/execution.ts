import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizePath } from "../utils/paths.js";
import { SyncError, ensureError } from "../utils/errors.js";
import { getLogger } from "../utils/log.js";
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
  const logger = getLogger("core:execution");
  const { dryRun } = flags;
  const report: ExecutionReport = {
    written: [],
  };

  if (actions.length === 0) {
    logger.debug({ evt: "exec.noop" }, "No actions to execute");
    return report;
  }

  logger.debug(
    { evt: "exec.start", dryRun, actionCount: actions.length },
    "Start execution",
  );

  const normalized = actions.map((a) => ({
    ...a,
    path: normalizePath(a.path),
    len: a.content.length,
  }));

  for (const { path, len, content } of normalized) {
    if (dryRun) {
      logger.debug({ evt: "write.preview", path, len });
      report.written.push(path);
      continue;
    }
    try {
      logger.debug({ evt: "write.start", path, len });
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      logger.debug({ evt: "write.ok", path });
      report.written.push(path);
    } catch (err) {
      logger.error({ err, path }, "write.fail");
      throw new SyncError(
        `Failed to write ${path}`,
        { action: "write", path },
        ensureError(err),
      );
    }
  }

  return report;
}
