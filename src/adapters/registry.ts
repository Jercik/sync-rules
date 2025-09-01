import { createAdapter } from "./adapters.js";
import type { AdapterName } from "../config/config.js";
import type { AdapterDefinition, AdapterMetadata } from "./adapters.js";

/**
 * Adapter definitions with metadata and optional configurations
 */
const ADAPTER_DEFS = Object.freeze({
  claude: {
    meta: {
      type: "single-file",
      location: "CLAUDE.md",
      title: "CLAUDE.md - Rules for Claude Code",
    } as const,
  },
  gemini: {
    meta: {
      type: "single-file",
      location: "GEMINI.md",
      title: "GEMINI.md - Rules for Gemini Code",
    } as const,
  },
  codex: {
    meta: {
      type: "single-file",
      location: "AGENTS.md",
      title: "AGENTS.md - Project docs for Codex CLI",
    } as const,
  },
  cline: {
    meta: { type: "multi-file", directory: ".clinerules" } as const,
  },
  kilocode: {
    meta: { type: "multi-file", directory: ".kilocode/rules" } as const,
  },
}) satisfies Record<AdapterName, { meta: AdapterMetadata }>;

export const adapterRegistry: Record<AdapterName, AdapterDefinition> = (() => {
  const reg: Record<AdapterName, AdapterDefinition> = {} as Record<
    AdapterName,
    AdapterDefinition
  >;
  for (const name of Object.keys(ADAPTER_DEFS) as AdapterName[]) {
    const meta = ADAPTER_DEFS[name].meta;
    reg[name] = {
      meta,
      planWrites: createAdapter(meta),
    };
  }
  return reg;
})();

export const adapterNames: readonly AdapterName[] =
  Object.keys(ADAPTER_DEFS) as AdapterName[];
