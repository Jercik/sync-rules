/**
 * Registry of supported AI coding assistant harnesses and their global config targets.
 *
 * Each harness maps to the absolute path where sync-rules writes global rules.
 * The registry is the single source of truth for valid harness names and target paths.
 */

export type HarnessName = "claude" | "gemini" | "opencode" | "codex";

type HarnessEntry = {
  readonly target: string;
};

export const HARNESS_REGISTRY: Record<HarnessName, HarnessEntry> = {
  claude: { target: "~/.claude/CLAUDE.md" },
  gemini: { target: "~/.gemini/AGENTS.md" },
  opencode: { target: "~/.config/opencode/AGENTS.md" },
  codex: { target: "~/.codex/AGENTS.md" },
};

export const HARNESS_NAMES = Object.keys(HARNESS_REGISTRY) as HarnessName[];
