import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { loadConfig } from "../config/loader.js";
import type { Project } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";
import type { SyncResult } from "../core/sync.js";

interface SyncCommandOptions {
  configPath: string;
  verbose: boolean;
  dryRun: boolean;
  porcelain: boolean;
}

type PatternWarning = {
  source: string;
  patterns: string[];
};

export async function runSyncCommand(
  options: SyncCommandOptions,
): Promise<void> {
  const { configPath, verbose, dryRun, porcelain } = options;
  const config = await loadConfig(configPath || DEFAULT_CONFIG_PATH);

  const projectsToSync: Project[] = config.projects;

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

  settlements.forEach((settlement, index) => {
    if (settlement.status === "rejected") {
      const project = projectsToSync[index];
      if (project) {
        failures.push({ project, error: ensureError(settlement.reason) });
      }
    }
  });

  if (failures.length > 0) {
    const errorMessages = failures.map(({ project, error }) => {
      let message = `  • Project: ${project.path}`;

      if (error instanceof SyncError) {
        message += `\n    Error: ${error.message}`;
        if (error.cause) {
          const causeMessage =
            error.cause instanceof Error
              ? error.cause.message
              : JSON.stringify(error.cause);
          message += `\n    Cause: ${causeMessage}`;
        }
      } else {
        message += `\n    Error: ${error.message}`;
      }

      return message;
    });

    const summary =
      failures.length === 1
        ? "Synchronization failed for 1 project:"
        : `Synchronization failed for ${String(failures.length)} projects:`;

    throw new Error(`${summary}\n${errorMessages.join("\n")}`);
  }

  const isFulfilled = (
    s: PromiseSettledResult<unknown>,
  ): s is PromiseFulfilledResult<SyncResult> => s.status === "fulfilled";
  const successes = settlements.filter(isFulfilled);

  // Collect unmatched patterns from successful project syncs
  for (const success of successes) {
    if (success.value.unmatchedPatterns.length > 0) {
      patternWarnings.push({
        source: success.value.projectPath,
        patterns: success.value.unmatchedPatterns,
      });
    }
  }

  // Collect all written paths for porcelain output
  const allWritten = [
    ...globalResult.written,
    ...successes.flatMap((s) => s.value.report.written),
  ];
  const allSkipped = [
    ...globalResult.skipped,
    ...successes.flatMap((s) => s.value.report.skipped),
  ];

  // Porcelain mode: machine-readable TSV output to stdout
  // Sort paths for deterministic output (concurrent project execution produces non-deterministic order)
  if (porcelain) {
    console.log("ACTION\tSOURCE\tDETAIL");
    for (const path of allWritten.toSorted()) {
      console.log(`WRITE\t\t${path}`);
    }
    for (const path of allSkipped.toSorted()) {
      console.log(`SKIP\t\t${path}`);
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

  // Human-readable mode: status messages to stderr (only if verbose)
  if (!verbose) {
    return; // Silent success per Unix convention
  }

  const totalWrites = allWritten.length;

  if (projectsToSync.length === 0) {
    console.error("No projects configured; nothing to do.");
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
