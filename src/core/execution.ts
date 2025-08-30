import { outputFile } from "fs-extra";
import { normalizePath } from "../utils/paths.ts";
import { logMessage } from "../utils/logger.ts";
import type { PathGuard } from "./path-guard.ts";
import type { WriteAction } from "../utils/content.ts";
import { SyncError, ensureError } from "../utils/errors.ts";

export interface ExecutionReport {
  success: boolean;
  written: string[];
  errors: Error[];
}

export async function executeActions(
  actions: WriteAction[],
  opts: { dryRun?: boolean; verbose?: boolean; pathGuard?: PathGuard } = {},
): Promise<ExecutionReport> {
  const { dryRun = false, verbose = false, pathGuard } = opts;
  const report: ExecutionReport = {
    success: true,
    written: [],
    errors: [],
  };

  if (actions.length === 0) {
    return report;
  }

  // Normalize all paths upfront to ensure uniformity
  const normalizedActions = actions.map((action) => ({
    ...action,
    path: pathGuard
      ? pathGuard.validatePath(action.path)
      : normalizePath(action.path),
  }));

  // Execute actions directly - fs-extra handles directory creation automatically
  for (const action of normalizedActions) {
    try {
      if (dryRun) {
        logMessage(`[Dry-run] [Write] ${action.path}`, verbose);
      }

      if (!dryRun) {
        logMessage(`Writing to: ${action.path}`, verbose);
        await outputFile(action.path, action.content, "utf8");
      }
      report.written.push(action.path);
    } catch (err) {
      // Wrap with err to provide context
      const error = new SyncError(
        `Failed to write ${action.path}`,
        {
          action: "write",
          path: action.path,
        },
        ensureError(err),
      );

      if (!dryRun) throw error; // fail fast

      // Only reachable in dry-run mode
      report.errors.push(error);
      report.success = false;
    }
  }

  return report;
}
