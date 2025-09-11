import { createAdapter } from "./adapters.js";
import type { AdapterDefinition, AdapterMetadata } from "./adapters.js";

/**
 * Adapter definitions with metadata and optional configurations
 */
const ADAPTER_DEFS = Object.freeze({
  claude: {
    meta: {
      type: "single-file",
      location: "CLAUDE.md",
    } as const,
  },
  gemini: {
    meta: {
      type: "single-file",
      location: "GEMINI.md",
    } as const,
  },
  codex: {
    meta: {
      type: "single-file",
      location: "AGENTS.md",
    } as const,
  },
  cline: {
    meta: { type: "multi-file", directory: ".clinerules" } as const,
  },
  kilocode: {
    meta: { type: "multi-file", directory: ".kilocode/rules" } as const,
  },
}) satisfies Record<string, { meta: AdapterMetadata }>;

export type AdapterName = keyof typeof ADAPTER_DEFS;

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
