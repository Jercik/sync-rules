import { adapterRegistry } from "../adapters/registry.js";
import { executeActions } from "./execution.js";
import type { ExecutionReport, WriteAction, RunFlags } from "./execution.js";
import { loadRules } from "./rules-fs.js";
import type { Project, Config } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";

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
 * @param options - Execution options such as `dryRun`.
 * @returns A summary of the execution results for the project.
 */
export async function syncProject(
  project: Project,
  flags: RunFlags = { dryRun: false },
  config: Config,
): Promise<SyncResult> {
  const allActions: WriteAction[] = [];

  const rulesDir = config.rulesSource;

  // Load rules once for all adapters - avoids redundant I/O

  const rules = await loadRules(rulesDir, project.rules);

  for (const adapterName of project.adapters) {
    try {
      // Generate actions for this adapter using pre-loaded rules
      const actions = adapterRegistry[
        adapterName as keyof typeof adapterRegistry
      ].planWrites({
        projectPath: project.path,
        rules,
      });

      allActions.push(...actions);
    } catch (err) {
      // Wrap the error with context and re-throw
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

  const report = await executeActions(allActions, flags);

  return { projectPath: project.path, report };
}
