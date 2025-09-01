import { adapterRegistry } from "../adapters/registry.js";
import { DEFAULT_RULES_SOURCE } from "../config/constants.js";
import { executeActions } from "./execution.js";
import type { ExecutionReport, WriteAction, RunFlags } from "./execution.js";
import { loadRules } from "./rules-fs.js";
import type { Project } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";
import { getLogger } from "../utils/log.js";

export interface SyncOptions {
  rulesSource?: string;
}

export interface SyncResult {
  projectPath: string;
  report: ExecutionReport;
}

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
  flags: RunFlags = { dryRun: false },
  options: SyncOptions = {},
): Promise<SyncResult> {
  const logger = getLogger("core:sync");
  const { dryRun } = flags;
  const { rulesSource } = options;
  const allActions: WriteAction[] = [];

  const rulesDir = rulesSource ?? DEFAULT_RULES_SOURCE;
  logger.debug(
    {
      evt: "sync.start",
      projectPath: project.path,
      adapters: project.adapters,
      ruleCount: project.rules.length,
      rulesDir,
      dryRun,
    },
    "Start",
  );

  // Load rules once for all adapters - avoids redundant I/O

  const rules = await loadRules(rulesDir, project.rules);
  logger.debug(
    { evt: "sync.rules.loaded", rulesCount: rules.length, rulesDir },
    "Rules loaded",
  );

  for (const adapterName of project.adapters) {
    try {
      logger.debug(
        { evt: "sync.adapter.start", adapter: adapterName },
        "Adapter start",
      );

      // Generate actions for this adapter using pre-loaded rules
      const actions = adapterRegistry[adapterName].planWrites({
        projectPath: project.path,
        rules,
      });

      logger.debug(
        {
          evt: "sync.adapter.plan",
          adapter: adapterName,
          actions: actions.map((a) => ({ path: a.path, type: "write" })),
          actionCount: actions.length,
        },
        `Adapter ${adapterName} planned actions`,
      );

      allActions.push(...actions);
    } catch (err) {
      logger.error(
        { err, evt: "sync.adapter.error", adapter: adapterName },
        `Failed to process adapter ${adapterName}`,
      );
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

  logger.debug(
    { evt: "sync.execute.start", actionCount: allActions.length },
    "Execute actions",
  );

  const report = await executeActions(allActions, flags);

  logger.info(
    {
      evt: "sync.done",
      projectPath: project.path,
      filesWritten: report.written.length,
    },
    "Done",
  );

  return { projectPath: project.path, report };
}
