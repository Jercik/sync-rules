import { executeActions } from "./execution.js";
import type { ExecutionReport, WriteAction, RunFlags } from "./execution.js";
import { loadRules } from "./rules-fs.js";
import type { Project, Config } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";
import { join } from "node:path";
import { lstat, rm, symlink } from "node:fs/promises";
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

  // Plan a single write: AGENTS.md with concatenated content
  const actions: WriteAction[] = [];
  if (rules.length > 0) {
    const agentsPath = resolveInside(project.path, "AGENTS.md");
    const header = `# AGENTS.md\n\nTo modify rules, edit the source ".md" files and run "sync-rules".\n\n`;
    const body = rules.map((r) => r.content).join("\n\n---\n\n");
    actions.push({ path: agentsPath, content: header + body });
  }

  const report = await executeActions(actions, flags);

  // Create/refresh CLAUDE.md symlink pointing to AGENTS.md
  if (!flags.dryRun) {
    const claudePath = join(project.path, "CLAUDE.md");
    const target = "AGENTS.md"; // relative within project

    // Guard: only symlink if AGENTS.md exists (was written now or already present)
    const agentsPath = resolveInside(project.path, "AGENTS.md");
    const wroteAgents = report.written.includes(agentsPath);
    let agentsExists = wroteAgents;
    if (!agentsExists) {
      try {
        await lstat(agentsPath);
        agentsExists = true;
      } catch {
        agentsExists = false;
      }
    }
    if (agentsExists) {
      try {
        // If something exists at CLAUDE.md, remove it (file or symlink)
        try {
          await lstat(claudePath);
          await rm(claudePath, { force: true });
        } catch {
          // ignore if it doesn't exist
        }
        await symlink(target, claudePath);
      } catch (err) {
        throw new SyncError(
          `Failed to create symlink ${claudePath} -> ${target}`,
          { action: "symlink", path: claudePath, project: project.path },
          ensureError(err),
        );
      }
    }
  }

  return { projectPath: project.path, report };
}
