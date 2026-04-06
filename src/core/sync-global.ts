import type { Config } from "../config/config.js";
import { loadRules, globRulePaths } from "./rules-fs.js";
import { concatenateRules } from "./concatenate-rules.js";
import { executeActions } from "./execution.js";
import type { RunFlags, ExecutionReport, WriteAction } from "./execution.js";
import { normalizePath } from "../utils/paths.js";
import { HARNESS_REGISTRY, HARNESS_NAMES } from "./harness-registry.js";
import type { HarnessName } from "./harness-registry.js";
import type { Rule } from "./rules-fs.js";

interface GlobalSyncResult extends ExecutionReport {
  unmatchedPatterns: string[];
}

/**
 * Detect rule file overlap between global patterns and per-harness override patterns.
 * Throws if the same rule file would be included twice for a single harness.
 */
async function detectOverlap(
  rulesSource: string,
  globalPatterns: string[],
  overridePatterns: string[],
  harnessName: HarnessName,
): Promise<void> {
  const [globalResult, overrideResult] = await Promise.all([
    globRulePaths(rulesSource, globalPatterns),
    globRulePaths(rulesSource, overridePatterns),
  ]);

  const globalPaths = new Set(globalResult.paths);
  const overlapping = overrideResult.paths.filter((p) => globalPaths.has(p));

  if (overlapping.length > 0) {
    const fileList = overlapping.join(", ");
    throw new Error(
      `Rule overlap for harness "${harnessName}": the following files appear in both "global" and "globalOverrides.${harnessName}": ${fileList}. Remove duplicates from one or the other.`,
    );
  }
}

/**
 * Synchronize global rules to harness-specific target paths.
 *
 * For each harness in the registry:
 * 1. Start with shared `global` rules content (if any)
 * 2. Append per-harness override content (if any)
 * 3. Write the combined content to the harness target path
 * 4. Skip harnesses with no content (no writes, no errors)
 */
export async function syncGlobal(
  flags: RunFlags,
  config: Config,
): Promise<GlobalSyncResult> {
  const globalPatterns = config.global;
  const overrides = config.globalOverrides;
  const hasGlobal = globalPatterns !== undefined && globalPatterns.length > 0;
  const hasOverrides =
    overrides !== undefined && Object.keys(overrides).length > 0;

  if (!hasGlobal && !hasOverrides) {
    return { written: [], skipped: [], unmatchedPatterns: [] };
  }

  // Load shared global rules once
  let sharedRules: Rule[] = [];
  let sharedUnmatched: string[] = [];
  if (hasGlobal) {
    const result = await loadRules(config.rulesSource, globalPatterns);
    sharedRules = result.rules;
    sharedUnmatched = result.unmatchedPatterns;
  }

  // Detect overlaps for each harness that has overrides
  if (hasGlobal && hasOverrides) {
    await Promise.all(
      HARNESS_NAMES.filter((name) => overrides[name] !== undefined).map(
        (name) => {
          const patterns = overrides[name];
          if (!patterns) return Promise.resolve();
          return detectOverlap(
            config.rulesSource,
            globalPatterns,
            patterns,
            name,
          );
        },
      ),
    );
  }

  const actions: WriteAction[] = [];
  const allUnmatched = [...sharedUnmatched];

  for (const harnessName of HARNESS_NAMES) {
    const entry = HARNESS_REGISTRY[harnessName];
    const targetPath = normalizePath(entry.target);
    const overridePatterns = overrides?.[harnessName];

    let overrideRules: Rule[] = [];
    if (overridePatterns !== undefined && overridePatterns.length > 0) {
      const result = await loadRules(config.rulesSource, overridePatterns);
      overrideRules = result.rules;
      if (result.unmatchedPatterns.length > 0) {
        allUnmatched.push(
          ...result.unmatchedPatterns.map(
            (p) => `globalOverrides.${harnessName}: ${p}`,
          ),
        );
      }
    }

    const combinedRules = [...sharedRules, ...overrideRules];
    if (combinedRules.length === 0) continue;

    const content = concatenateRules(combinedRules);
    actions.push({ path: targetPath, content });
  }

  if (actions.length === 0) {
    return { written: [], skipped: [], unmatchedPatterns: allUnmatched };
  }

  const report = await executeActions(actions, flags);
  return { ...report, unmatchedPatterns: allUnmatched };
}
