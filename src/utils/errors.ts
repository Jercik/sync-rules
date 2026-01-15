/**
 * Type for SyncError details with specific fields for different error contexts
 */
interface SyncErrorDetails {
  project?: string;
  action?: string;
  path?: string;
}

/**
 * Custom error class for sync-rules operations with built-in details support.
 */
export class SyncError extends Error {
  readonly details: SyncErrorDetails;

  constructor(message: string, details: SyncErrorDetails = {}, cause?: Error) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.details = details;
  }
}

/**
 * Error thrown when config file is not found.
 */
export class ConfigNotFoundError extends Error {
  readonly path: string;
  readonly isDefault: boolean;

  constructor(path: string, isDefault = false) {
    const location = isDefault ? "Default config file" : "Config file";
    const hint = isDefault
      ? "Run 'sync-rules --init' to create one, or pass --config <path>."
      : "Check the path, or create one with 'sync-rules --init --config <path>'.";
    super(
      `${location} not found at ${path}.\n${hint}\nTry 'sync-rules --help' for details.`,
    );
    this.name = this.constructor.name;
    this.path = path;
    this.isDefault = isDefault;
  }
}

/**
 * Error thrown when config file cannot be accessed (permissions, not a file, etc.)
 */
export class ConfigAccessError extends Error {
  readonly path: string;
  readonly originalError?: Error;

  constructor(path: string, originalError?: Error) {
    const base = originalError
      ? `Cannot access config at ${path}: ${originalError.message}`
      : `Cannot access config at ${path}`;
    const hint = "Check the file path and permissions.";
    const baseWithPeriod = /[.!?]$/u.test(base) ? base : `${base}.`;
    super(`${baseWithPeriod}\n${hint}`, { cause: originalError });
    this.name = this.constructor.name;
    this.path = path;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when config file cannot be parsed or is invalid.
 */
export class ConfigParseError extends Error {
  readonly path: string;
  readonly originalError?: Error;

  constructor(path: string, originalError?: Error) {
    const base = originalError
      ? `Failed to load config from ${path}: ${originalError.message}`
      : `Failed to parse config from ${path}`;
    const hint =
      "Fix the JSON and glob patterns, then retry.\nTry 'sync-rules --help' for schema and examples.";
    const baseWithPeriod = /[.!?]$/u.test(base) ? base : `${base}.`;
    super(`${baseWithPeriod}\n${hint}`, { cause: originalError });
    this.name = this.constructor.name;
    this.path = path;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when a subprocess spawn fails.
 */
export class SpawnError extends Error {
  readonly command: string;
  readonly exitCode?: number;
  readonly code?: string;
  readonly signal?: string;

  constructor(
    command: string,
    code?: string,
    exitCode?: number,
    signal?: string,
    cause?: Error,
  ) {
    const message = SpawnError.buildMessage(command, code, exitCode, signal);
    super(message, { cause });
    this.name = this.constructor.name;
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
    this.signal = signal;
  }

  /**
   * Builds the appropriate error message based on the error conditions.
   * Centralizes all spawn error message strings in one place.
   */
  static buildMessage(
    command: string,
    code?: string,
    exitCode?: number,
    signal?: string,
  ): string {
    // Command not found (ENOENT)
    if (code === "ENOENT") {
      return `"${command}" not found on PATH or cwd invalid. Install it or verify working directory.`;
    }

    // Process killed by signal with specific signal name
    if (signal) {
      return `Process "${command}" killed by signal ${signal}`;
    }

    // Tool exited with non-zero code
    if (exitCode !== undefined && exitCode !== 0) {
      return `Tool '${command}' exited with code ${String(exitCode)}`;
    }

    // Generic failure
    return `Failed to launch "${command}"`;
  }
}

/**
 * Ensures that an unknown caught value is an Error object.
 * @param error - The unknown value to ensure is an Error
 */
export function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Type guard to safely check if an error is a Node.js ErrnoException
 * @param error - The error to check
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (typeof (error as { code: unknown }).code === "string" ||
      typeof (error as { code: unknown }).code === "number")
  );
}
