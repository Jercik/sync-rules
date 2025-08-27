import type { Adapter } from "../config.ts";
import type { FSAction } from "../utils.ts";
import { claudeAdapter } from "./claude.ts";
import { clineAdapter } from "./cline.ts";
import { geminiAdapter } from "./gemini.ts";
import { kilocodeAdapter } from "./kilocode.ts";
import { codexAdapter } from "./codex.ts";

/**
 * Input structure for adapter functions
 */
export type AdapterInput = {
  projectPath: string;
  rules: Array<{ path: string; content: string }>;
};

/**
 * Function signature for adapters
 */
export type AdapterFunction = (input: AdapterInput) => FSAction[];

/**
 * Registry of available adapters
 */
const adapterRegistry = new Map<Adapter, AdapterFunction>([
  ["claude", claudeAdapter],
  ["cline", clineAdapter],
  ["gemini", geminiAdapter],
  ["kilocode", kilocodeAdapter],
  ["codex", codexAdapter],
]);

/**
 * Retrieves an adapter function by name
 * @param adapter - The adapter name
 * @returns The adapter function
 * @throws If the adapter is not found
 */
export function getAdapter(adapter: Adapter): AdapterFunction {
  const fn = adapterRegistry.get(adapter);
  if (!fn) {
    throw new Error(`Unknown adapter: ${adapter}`);
  }
  return fn;
}

/**
 * Exported registry for extensibility
 */
export { adapterRegistry };
