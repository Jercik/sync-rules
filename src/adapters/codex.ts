import type { AdapterFunction } from "./index.ts";
import { makeSingleFileAdapter } from "./shared.ts";

/**
 * Codex adapter - writes all rules into AGENTS.md for Codex CLI
 */
export const codexAdapter: AdapterFunction = makeSingleFileAdapter({
  filename: "AGENTS.md",
  headerTitle: "AGENTS.md - Project docs for Codex CLI",
});
