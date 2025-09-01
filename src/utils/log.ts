// src/utils/log.ts
import pino, { type Logger } from "pino";
import envPaths from "env-paths";
import { join } from "node:path";
import { validateLogLevel } from "./type-guards.js";

export interface LogConfig {
  level?: pino.LevelWithSilent;
  toFile?: boolean;
}

function destinations(toFile: boolean, logFile: string) {
  const targets: Array<{ target: string; options?: Record<string, unknown> }> = [];

  // Console: pretty if TTY, plain JSON otherwise
  if (process.stdout.isTTY) {
    targets.push({ target: "pino-pretty", options: { colorize: true } });
  } else {
    targets.push({ target: "pino/file", options: { destination: 1 } }); // stdout
  }

  // Optional file logging
  if (toFile) {
    targets.push({
      target: "pino/file",
      options: { destination: logFile, mkdir: true },
    });
  }

  return { targets };
}

export function createLogger(cfg: LogConfig = {}): Logger {
  const envLevel = validateLogLevel(process.env.LOG_LEVEL);
  const level = cfg.level ?? envLevel ?? "warn";
  if (level === "silent") return pino({ level: "silent" });

  const logFile = join(envPaths("sync-rules").log, "debug.log");
  const toFile = cfg.toFile ?? process.env.LOG_TO_FILE === "1";

  return pino({
    level,
    redact: { paths: ["args", "options.token", "env"], remove: true },
    transport: destinations(toFile, logFile),
  });
}

// Singletons and helpers
export const rootLogger = createLogger();
export const getLogger = (module: string) => rootLogger.child({ module });
/**
 * Path to the log file used by pino/file transport.
 */
export function getLogFilePath(): string {
  return join(envPaths("sync-rules").log, "debug.log");
}
