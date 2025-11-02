import type { Command } from "commander";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";
import { loadConfig } from "../config/loader.js";
import type { Project } from "../config/config.js";
import { SyncError, ensureError } from "../utils/errors.js";
import type { ExecutionReport } from "../core/execution.js";

export async function runSyncCommand(program: Command): Promise<void> {
  const parentOpts = program.opts<{ config?: string }>();
  const config = await loadConfig(parentOpts.config || DEFAULT_CONFIG_PATH);

  const projectsToSync: Project[] = config.projects;

  const { syncProject } = await import("../core/sync.js");
  const { syncGlobal } = await import("../core/sync-global.js");

  const globalReport = await syncGlobal({ dryRun: false }, config);

  const settlements = await Promise.allSettled(
    projectsToSync.map(async (project: Project) => {
      return await syncProject(project, { dryRun: false }, config);
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

  interface SyncResultLite {
    projectPath: string;
    report: ExecutionReport;
  }
  const isFulfilled = (
    s: PromiseSettledResult<unknown>,
  ): s is PromiseFulfilledResult<SyncResultLite> => s.status === "fulfilled";
  const successes = settlements.filter(isFulfilled);
  const projectWrites = successes.reduce(
    (acc, s) => acc + s.value.report.written.length,
    0,
  );
  const totalWrites = projectWrites + globalReport.written.length;

  if (projectsToSync.length === 0) {
    console.log("No projects configured; nothing to do.");
  } else if (totalWrites === 0) {
    console.log("No changes. Rules matched no files or files up to date.");
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
    console.log(
      `Synchronized ${projectInfo}; wrote ${String(totalWrites)} file(s).`,
    );
  }
}
