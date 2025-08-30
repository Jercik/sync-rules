import { adapterFromMeta } from "./adapters.ts";
import { claudeFilter } from "./filters.ts";
import type { AdapterName } from "../config/config.ts";
import type { AdapterDefinition } from "./adapters.ts";

/**
 * Registry of available adapters with metadata
 */
export const adapterRegistry = {
  claude: {
    meta: { type: "single-file", location: "CLAUDE.md" } as const,
    planWrites: adapterFromMeta(
      { type: "single-file", location: "CLAUDE.md" },
      {
        headerTitle: "CLAUDE.md - Rules for Claude Code",
        filter: claudeFilter,
      },
    ),
  },
  cline: {
    meta: { type: "multi-file", directory: ".clinerules" } as const,
    planWrites: adapterFromMeta({
      type: "multi-file",
      directory: ".clinerules",
    }),
  },
  gemini: {
    meta: { type: "single-file", location: "GEMINI.md" } as const,
    planWrites: adapterFromMeta(
      { type: "single-file", location: "GEMINI.md" },
      { headerTitle: "GEMINI.md - Rules for Gemini Code" },
    ),
  },
  kilocode: {
    meta: { type: "multi-file", directory: ".kilocode/rules" } as const,
    planWrites: adapterFromMeta({
      type: "multi-file",
      directory: ".kilocode/rules",
    }),
  },
  codex: {
    meta: { type: "single-file", location: "AGENTS.md" } as const,
    planWrites: adapterFromMeta(
      { type: "single-file", location: "AGENTS.md" },
      { headerTitle: "AGENTS.md - Project docs for Codex CLI" },
    ),
  },
} as const satisfies Record<AdapterName, AdapterDefinition>;

/**
 * Array of available adapter names
 */
export const adapterNames = Object.keys(adapterRegistry) as AdapterName[];
