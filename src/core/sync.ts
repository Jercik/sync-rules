import { adapters } from "../adapters/adapters.ts";
import { CENTRAL_RULES_DIR } from "../config/constants.ts";
import { executeActions } from "./execution.ts";
import type { ExecutionReport } from "./execution.ts";
import { loadRulesFromCentral } from "./filesystem.ts";
import type { Project } from "../config/config.ts";
import { ensureError } from "../utils/logger.ts";
import type { WriteAction } from "../utils/content.ts";
import { SyncError } from "../utils/errors.ts";
import type { PathGuard } from "./path-guard.ts";

export interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  pathGuard?: PathGuard;
}

export interface SyncResult {
  projectPath: string;
  report: ExecutionReport;
}

/**
 * Synchronizes rules for a single project
 */
/**
 * Synchronize rules for a single project by:
 * 1) Loading rule files from the central repository once,
 * 2) Generating adapter-specific FS actions, and
 * 3) Executing those actions (optionally as a dry run).
 *
 * @param project - The project configuration to sync.
 * @param options - Execution options such as `dryRun` and `verbose`.
 * @returns A summary of the execution results for the project.
 */
export async function syncProject(
  project: Project,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const { dryRun = false, verbose = false, pathGuard } = options;
  const allActions: WriteAction[] = [];

  // Avoid touching the filesystem here; directory creation is handled
  // automatically by fs-extra during write execution.

  // Load rules once for all adapters - avoids redundant I/O
  const rules = await loadRulesFromCentral(CENTRAL_RULES_DIR, project.rules);

  // Process rules for all adapters
  for (const adapterName of project.adapters) {
    try {
      // Get the adapter definition from the registry
      const adapterDef = adapters[adapterName];
      if (!adapterDef) {
        throw new Error(`Unknown adapter: ${adapterName}`);
      }

      // Generate actions for this adapter using pre-loaded rules
      const actions = adapterDef.generateActions({
        projectPath: project.path,
        rules,
      });

      allActions.push(...actions);
    } catch (err) {
      // Wrap the error with context and re-throw
      // The CLI will handle logging with proper formatting
      throw new SyncError(
        `Failed to process adapter '${adapterName}'`,
        {
          adapter: adapterName,
          project: project.path,
        },
        ensureError(err),
      );
    }
  }

  // Execute actions for this project
  const report = await executeActions(allActions, {
    dryRun,
    verbose,
    pathGuard,
  });

  return { projectPath: project.path, report };
}
