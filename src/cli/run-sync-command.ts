import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { loadConfig } from "../config/loader.js";
import type { Project } from "../config/config.js";
import { ensureError } from "../utils/errors.js";
import type { SyncResult } from "../core/sync.js";
import type { SkippedEntry } from "../core/execution.js";
import { formatSyncFailureMessage } from "./format-sync-failures.js";

interface SyncCommandOptions {
  configPath: string;
  verbose: boolean;
  dryRun: boolean;
  porcelain: boolean;
  json: boolean;
}

type PatternWarning = {
  source: string;
  patterns: string[];
};

function isFulfilled(
  s: PromiseSettledResult<unknown>,
): s is PromiseFulfilledResult<SyncResult> {
  return s.status === "fulfilled";
}

export async function runSyncCommand(
  options: SyncCommandOptions,
): Promise<void> {
  const { configPath, verbose, dryRun, porcelain, json } = options;
  const config = await loadConfig(configPath || DEFAULT_CONFIG_PATH);

  const projectsToSync: Project[] = config.projects ?? [];

  const { syncProject } = await import("../core/sync.js");
  const { syncGlobal } = await import("../core/sync-global.js");

  const globalResult = await syncGlobal({ dryRun }, config);

  // Track warnings for unmatched patterns
  const patternWarnings: PatternWarning[] = [];
  if (globalResult.unmatchedPatterns.length > 0) {
    patternWarnings.push({
      source: "global",
      patterns: globalResult.unmatchedPatterns,
    });
  }

  const settlements = await Promise.allSettled(
    projectsToSync.map(async (project: Project) => {
      return await syncProject(project, { dryRun }, config);
    }),
  );

  const failures: Array<{ project: Project; error: Error }> = [];

  for (const [index, settlement] of settlements.entries()) {
    if (settlement.status === "rejected") {
      const project = projectsToSync[index];
      if (project) {
        failures.push({ project, error: ensureError(settlement.reason) });
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(formatSyncFailureMessage(failures));
  }

  const successes = settlements.filter((x) => isFulfilled(x));

  // Collect unmatched patterns from successful project syncs
  for (const success of successes) {
    if (success.value.unmatchedPatterns.length > 0) {
      patternWarnings.push({
        source: success.value.projectPath,
        patterns: success.value.unmatchedPatterns,
      });
    }
  }

  // Collect all written and skipped paths
  const allWritten = [
    ...globalResult.written,
    ...successes.flatMap((s) => s.value.report.written),
  ];
  const allSkipped: SkippedEntry[] = [
    ...globalResult.skipped,
    ...successes.flatMap((s) => s.value.report.skipped),
  ];

  // JSON mode: structured output to stdout
  if (json) {
    const output = {
      written: allWritten.toSorted(),
      skipped: allSkipped.toSorted((a, b) => a.path.localeCompare(b.path)),
      warnings: patternWarnings
        .toSorted((a, b) => a.source.localeCompare(b.source))
        .flatMap((w) =>
          w.patterns.map((pattern) => ({ source: w.source, pattern })),
        ),
    };
    console.log(JSON.stringify(output, undefined, 2));
    return;
  }

  // Porcelain mode: machine-readable TSV output to stdout
  // Sort paths for deterministic output (concurrent project execution produces non-deterministic order)
  if (porcelain) {
    console.log("ACTION\tSOURCE\tDETAIL");
    for (const path of allWritten.toSorted()) {
      console.log(`WRITE\t\t${path}`);
    }
    for (const entry of allSkipped.toSorted((a, b) =>
      a.path.localeCompare(b.path),
    )) {
      console.log(`SKIP\t${entry.reason}\t${entry.path}`);
    }
    // Sort warnings for deterministic output
    for (const warning of patternWarnings.toSorted((a, b) =>
      a.source.localeCompare(b.source),
    )) {
      for (const pattern of warning.patterns) {
        console.log(`WARN\t${warning.source}\t${pattern}`);
      }
    }
    return;
  }

  // Always output warnings for unmatched patterns (regardless of verbose mode)
  // These indicate potential config issues that users should be aware of
  if (patternWarnings.length > 0) {
    console.error("Warning: The following patterns did not match any rules:");
    // Sort warnings for deterministic output
    for (const warning of patternWarnings.toSorted((a, b) =>
      a.source.localeCompare(b.source),
    )) {
      const sourceLabel =
        warning.source === "global" ? "global config" : warning.source;
      for (const pattern of warning.patterns) {
        console.error(`  • ${pattern} (in ${sourceLabel})`);
      }
    }
  }

  // Always output skip warnings (regardless of verbose mode)
  if (allSkipped.length > 0) {
    console.error("Warning: The following paths were skipped:");
    for (const entry of allSkipped.toSorted((a, b) =>
      a.path.localeCompare(b.path),
    )) {
      const reasonLabel =
        entry.reason === "parent_missing"
          ? "parent directory does not exist"
          : "parent path is not a directory";
      console.error(`  • ${entry.path} (${reasonLabel})`);
    }
  }

  // Human-readable mode: status messages to stderr (only if verbose)
  if (!verbose) {
    return; // Silent success per Unix convention
  }

  const totalWrites = allWritten.length;

  if (projectsToSync.length === 0 && totalWrites === 0) {
    console.error("No projects configured; nothing to do.");
  } else if (projectsToSync.length === 0) {
    const action = dryRun ? "Would write" : "Wrote";
    console.error(`${action} ${String(totalWrites)} global file(s).`);
  } else if (totalWrites === 0) {
    console.error("No changes. Rules matched no files or files up to date.");
  } else {
    let projectInfo: string;
    if (projectsToSync.length === 1) {
      const [firstProject] = projectsToSync;
      projectInfo = firstProject
        ? `project (${firstProject.path})`
        : "1 project(s)";
    } else {
      projectInfo = `${String(projectsToSync.length)} project(s)`;
    }
    const action = dryRun ? "Would write" : "Wrote";
    console.error(
      `Synchronized ${projectInfo}; ${action} ${String(totalWrites)} file(s).`,
    );
  }
}
