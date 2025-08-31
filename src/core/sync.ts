import { adapterRegistry } from "../adapters/registry.ts";
import { getRulesSource } from "../config/constants.ts";
import { executeActions } from "./execution.ts";
import type { ExecutionReport } from "./execution.ts";
import { loadRulesFromCentral } from "./rules-fs.ts";
import type { Project } from "../config/config.ts";
import type { WriteAction } from "../utils/content.ts";
import { SyncError, ensureError } from "../utils/errors.ts";
import type { PathGuard } from "./path-guard.ts";
import { createPathGuardForPlannedWrites } from "./path-guard.ts";
import { logger } from "../utils/pino-logger.ts";

export interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  pathGuard?: PathGuard;
  rulesSource?: string;
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
  const { dryRun = false, verbose = false, pathGuard, rulesSource } = options;
  const allActions: WriteAction[] = [];

  // Determine the rules source directory
  const rulesDir = getRulesSource(rulesSource);

  logger.debug(
    {
      projectPath: project.path,
      adapters: project.adapters,
      ruleCount: project.rules.length,
      rulesDir,
      dryRun,
      verbose,
    },
    "Starting project sync",
  );

  // Avoid touching the filesystem here; directory creation is handled
  // automatically by fs-extra during write execution.

  // Load rules once for all adapters - avoids redundant I/O
  const rules = await loadRulesFromCentral(rulesDir, project.rules);
  logger.debug(`Loaded ${rules.length} rules from central repository`);

  // Process rules for all adapters
  for (const adapterName of project.adapters) {
    try {
      logger.debug(`Processing adapter: ${adapterName}`);

      // Get the adapter definition from the registry
      const adapterDef = adapterRegistry[adapterName];
      if (!adapterDef) {
        logger.error(`Unknown adapter: ${adapterName}`);
        throw new Error(`Unknown adapter: ${adapterName}`);
      }

      // Generate actions for this adapter using pre-loaded rules
      const actions = adapterDef.planWrites({
        projectPath: project.path,
        rules,
      });

      logger.debug(
        {
          actions: actions.map((a) => ({ path: a.path, type: "write" })),
        },
        `Adapter ${adapterName} generated ${actions.length} actions`,
      );

      allActions.push(...actions);
    } catch (err) {
      logger.error(err, `Failed to process adapter ${adapterName}`);
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

  // Execute only the planned writes (defense-in-depth)
  // If no pathGuard is provided, create one from the planned actions
  // This ensures we only write to explicitly planned paths
  const plannedGuard =
    pathGuard ?? createPathGuardForPlannedWrites(allActions.map((a) => a.path));

  logger.debug(`Executing ${allActions.length} total actions`);

  const report = await executeActions(allActions, {
    dryRun,
    verbose,
    pathGuard: plannedGuard,
  });

  logger.info(
    {
      projectPath: project.path,
      filesWritten: report.written.length,
      errors: report.errors.length,
      success: report.success,
    },
    "Sync completed",
  );

  return { projectPath: project.path, report };
}
