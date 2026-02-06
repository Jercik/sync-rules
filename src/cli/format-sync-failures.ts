import { SyncError } from "../utils/errors.js";
import type { Project } from "../config/config.js";

type SyncFailure = { project: Project; error: Error };

export function formatSyncFailureMessage(failures: SyncFailure[]): string {
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

  return `${summary}\n${errorMessages.join("\n")}`;
}
