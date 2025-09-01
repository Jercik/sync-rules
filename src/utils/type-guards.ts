import type { ExecaError } from "execa";
import type { LevelWithSilent } from "pino";

/**
 * Type guard to check if an error is an Execa execution error
 */
export function isExecaError(error: unknown): error is ExecaError {
  return (
    error instanceof Error &&
    "exitCode" in error &&
    "command" in error &&
    typeof (error as ExecaError).command === "string"
  );
}

/**
 * Type guard to check if a string is a valid Pino log level
 */
export function isPinoLogLevel(value: unknown): value is LevelWithSilent {
  const validLevels = [
    "silent",
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ] as const;
  return (
    typeof value === "string" &&
    (validLevels as readonly string[]).includes(value)
  );
}

/**
 * Validates and returns a Pino log level, or undefined if invalid
 */
export function validateLogLevel(value: unknown): LevelWithSilent | undefined {
  return isPinoLogLevel(value) ? value : undefined;
}

// Note: Commander-specific type guards removed in favor of `instanceof CommanderError`.
