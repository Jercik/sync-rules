import { executeActions } from "./execution.js";
import type { ExecutionReport, WriteAction, RunFlags } from "./execution.js";
import { loadRules } from "./rules-fs.js";
import type { Project, Config } from "../config/config.js";
import { lstat } from "node:fs/promises";
import { resolveInside } from "../utils/paths.js";

export interface SyncResult {
  projectPath: string;
  report: ExecutionReport;
  unmatchedPatterns: string[];
}

const DEFAULT_RUN_FLAGS: RunFlags = { dryRun: false };

/**
 * Synchronize rules for a single project.
 *
 * Process:
 * 1. Load rule files from the central repository using project-specific glob patterns
 * 2. Generate AGENTS.md with concatenated rule content
 * 3. Execute write actions (respecting dry-run flag)
 * 4. Ensure a CLAUDE.md include file points to AGENTS.md for Claude Code compatibility
 *
 * @param project - The project configuration specifying path and rule patterns
 * @param flags - Execution options (e.g., `{ dryRun: true }` to preview changes)
 * @param config - Global configuration containing rulesSource path
 * @returns Summary of execution results including paths written
 */
export async function syncProject(
  project: Project,
  flags: RunFlags = DEFAULT_RUN_FLAGS,
  config: Config,
): Promise<SyncResult> {
  const rulesDirectory = config.rulesSource;
  // Load rules once
  const { rules, unmatchedPatterns } = await loadRules(
    rulesDirectory,
    project.rules,
  );

  // Plan writes
  const actions: WriteAction[] = [];
  const agentsPath = resolveInside(project.path, "AGENTS.md");

  if (rules.length > 0) {
    // Write AGENTS.md with concatenated content
    const content = rules.map((r) => r.content).join("\n\n---\n\n");
    actions.push({ path: agentsPath, content });

    // Also write CLAUDE.md include file (Claude Code supported syntax)
    const claudePath = resolveInside(project.path, "CLAUDE.md");
    actions.push({ path: claudePath, content: "@AGENTS.md" });
  }

  const report = await executeActions(actions, flags);

  // If no rules were written this run but AGENTS.md already exists, ensure CLAUDE.md is present
  // Dry-run behavior is respected via the 'flags' parameter passed to executeActions; no special handling is needed here.
  if (rules.length === 0) {
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
      const claudeReport = await executeActions(
        [{ path: claudePath, content: "@AGENTS.md" }],
        flags,
      );
      // Merge CLAUDE.md write result into the main report so callers see full outcome
      report.written.push(...claudeReport.written);
      report.skipped.push(...claudeReport.skipped);
    }
  }

  return { projectPath: project.path, report, unmatchedPatterns };
}
