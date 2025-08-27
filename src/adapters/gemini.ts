import type { AdapterFunction } from "./index.ts";
import { makeSingleFileAdapter } from "./shared.ts";

/**
 * Gemini adapter - concatenates all rules into a single GEMINI.md file
 */
export const geminiAdapter: AdapterFunction = makeSingleFileAdapter({
  filename: "GEMINI.md",
  headerTitle: "GEMINI.md - Rules for Gemini Code",
});
