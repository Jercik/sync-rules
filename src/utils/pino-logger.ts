import pino from "pino";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Create a minimal pino logger for the CLI
 * - Only logs to file when LOG_LEVEL is set or for launch command
 * - File logging is off by default
 * - No console output hijacking
 */
function createLogger() {
  const logLevel = process.env.LOG_LEVEL || "silent";
  const isLaunch = process.env.SYNC_RULES_LAUNCH === "1";
  const isVerbose = process.env.SYNC_RULES_VERBOSE === "1";

  // Pretty-print to stdout only in verbose mode; no console hijack
  if (isVerbose) {
    return pino({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    });
  }

  // Honor "silent" level even in launch mode - if user explicitly sets silent, respect it
  if (logLevel === "silent") {
    return pino({ level: "silent" });
  }

  // Log to file when LOG_LEVEL is set (and not silent) or in launch mode
  const shouldLogToFile = logLevel !== "silent" || isLaunch;
  if (!shouldLogToFile) {
    // Return a silent logger when logging is disabled
    return pino({ level: "silent" });
  }

  // Log to file only when explicitly enabled
  const logFile = join(homedir(), ".sync-rules", "debug.log");

  return pino(
    {
      // In launch mode, use debug level for better diagnostics (but not if explicitly silent)
      level: isLaunch && !process.env.LOG_LEVEL ? "debug" : logLevel,
    },
    pino.destination({
      dest: logFile,
      sync: false,
      mkdir: true,
    }),
  );
}

export const logger = createLogger();
