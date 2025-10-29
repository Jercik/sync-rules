import { executeActions } from "./execution.js";
import type { ExecutionReport, WriteAction, RunFlags } from "./execution.js";
import { loadRules } from "./rules-fs.js";
import type { Project, Config } from "../config/config.js";
import { lstat } from "node:fs/promises";
import { resolveInside } from "../utils/paths.js";

export interface SyncResult {
  projectPath: string;
  report: ExecutionReport;
}

/**
 * Synchronize rules for a single project.
 *
 * Process:
 * 1. Load rule files from the central repository using project-specific glob patterns
 * 2. Generate AGENTS.md with concatenated rule content
 * 3. Execute write actions (respecting dry-run flag)
 * 4. Create CLAUDE.md symlink pointing to AGENTS.md for Claude Code compatibility
 *
 * @param project - The project configuration specifying path and rule patterns
 * @param flags - Execution options (e.g., `{ dryRun: true }` to preview changes)
 * @param config - Global configuration containing rulesSource path
 * @returns Summary of execution results including paths written
 */
export async function syncProject(
  project: Project,
  flags: RunFlags = { dryRun: false },
  config: Config,
): Promise<SyncResult> {
  const rulesDir = config.rulesSource;
  // Load rules once
  const rules = await loadRules(rulesDir, project.rules);

  // Plan writes
  const actions: WriteAction[] = [];
  const agentsPath = resolveInside(project.path, "AGENTS.md");

  if (rules.length > 0) {
    // Write AGENTS.md with concatenated content
    const header = `# AGENTS.md\n\nTo modify rules, edit the source ".md" files and run "sync-rules".\n\n`;
    const body = rules.map((r) => r.content).join("\n\n---\n\n");
    actions.push({ path: agentsPath, content: header + body });

    // Also write CLAUDE.md include file (Claude Code supported syntax)
    const claudePath = resolveInside(project.path, "CLAUDE.md");
    actions.push({ path: claudePath, content: "@AGENTS.md" });
  }

  const report = await executeActions(actions, flags);

  // If no rules were written this run but AGENTS.md already exists, ensure CLAUDE.md is present
  if (!flags.dryRun && rules.length === 0) {
    let agentsExists = report.written.includes(agentsPath);
    if (!agentsExists) {
      try {
        await lstat(agentsPath);
        agentsExists = true;
      } catch {
        agentsExists = false;
      }
    }
    if (agentsExists) {
      const claudePath = resolveInside(project.path, "CLAUDE.md");
      await executeActions(
        [{ path: claudePath, content: "@AGENTS.md" }],
        flags,
      );
    }
  }

  return { projectPath: project.path, report };
}
