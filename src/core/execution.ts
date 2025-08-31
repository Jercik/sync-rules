import { outputFile } from "fs-extra";
import { normalizePath } from "../utils/paths.js";
import { logMessage } from "../utils/logger.js";
import type { PathGuard } from "./path-guard.js";
import type { WriteAction } from "../utils/content.js";
import { SyncError, ensureError } from "../utils/errors.js";
import { logger } from "../utils/pino-logger.js";

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
    logger.debug("No actions to execute");
    return report;
  }

  logger.debug({ dryRun }, `Executing ${actions.length} actions`);

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
        logger.debug(
          {
            contentLength: action.content.length,
          },
          `Writing file: ${action.path}`,
        );
        await outputFile(action.path, action.content, "utf8");
        logger.debug(`Successfully wrote file: ${action.path}`);
      }
      report.written.push(action.path);
    } catch (err) {
      logger.error(err, `Failed to write file: ${action.path}`);

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
