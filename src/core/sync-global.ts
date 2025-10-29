import type { Config } from "../config/config.js";
import { loadRules } from "./rules-fs.js";
import { executeActions } from "./execution.js";
import type { RunFlags, ExecutionReport, WriteAction } from "./execution.js";
import { normalizePath } from "../utils/paths.js";

// Built-in global target files for supported tools
const BUILT_IN_GLOBAL_TARGETS = [
  "~/.claude/CLAUDE.md", // Claude Code
  "~/.gemini/AGENTS.md", // Gemini CLI
  "~/.config/opencode/AGENTS.md", // OpenCode
  "~/.codex/AGENTS.md", // Codex CLI
] as const;

export function getGlobalTargetPaths(): string[] {
  // Normalize so paths stay consistent across platforms
  const targets = BUILT_IN_GLOBAL_TARGETS.map((p) => normalizePath(p));
  return targets;
}

/**
 * Synchronize global rules to the built-in absolute target paths.
 * Combines all selected global rule files into one content and writes it to each target path.
 */
export async function syncGlobal(
  flags: RunFlags,
  config: Config,
): Promise<ExecutionReport> {
  const patterns = config.global;
  if (!patterns || patterns.length === 0) {
    return { written: [] };
  }

  const rules = await loadRules(config.rulesSource, patterns);
  if (rules.length === 0) {
    return { written: [] };
  }
  const content = rules.map((r) => r.content).join("\n\n---\n\n");

  const targets = getGlobalTargetPaths();
  const actions: WriteAction[] = targets.map((path) => ({ path, content }));

  return executeActions(actions, flags);
}
