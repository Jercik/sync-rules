/**
 * Type for SyncError details with specific fields for different error contexts
 */
export interface SyncErrorDetails {
  adapter?: string;
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
    super(
      isDefault
        ? `Default config file not found at ${path}`
        : `Config file not found at ${path}`,
    );
    this.name = this.constructor.name;
    this.path = path;
    this.isDefault = isDefault;
  }
}

/**
 * Error thrown when config file cannot be parsed or is invalid.
 */
export class ConfigParseError extends Error {
  readonly path: string;
  readonly originalError?: Error;

  constructor(path: string, originalError?: Error) {
    super(
      originalError
        ? `Failed to load config from ${path}: ${originalError.message}`
        : `Failed to parse config from ${path}`,
      { cause: originalError },
    );
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

  constructor(
    command: string,
    code?: string,
    exitCode?: number,
    message?: string,
    cause?: Error,
  ) {
    const baseMessage =
      code === "ENOENT"
        ? `"${command}" not found on PATH or cwd invalid. Install it or verify working directory.`
        : message || `Failed to launch "${command}"`;

    super(baseMessage, { cause });
    this.name = this.constructor.name;
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
  }
}

/**
 * Ensures that an unknown caught value is an Error object.
 * @param e - The unknown value to ensure is an Error
 * @returns An Error object
 */
export function ensureError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Type guard to safely check if an error is a Node.js ErrnoException
 * @param e - The error to check
 * @returns true if the error is a NodeJS.ErrnoException
 */
export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (typeof (e as { code: unknown }).code === "string" ||
      typeof (e as { code: unknown }).code === "number")
  );
}

/**
 * Error thrown when the current working directory does not match any
 * configured project in the provided config file.
 */
export class ProjectNotFoundError extends Error {
  constructor(
    readonly cwd: string,
    readonly configPath: string,
  ) {
    super(`Project at ${cwd} not found in config at ${configPath}`);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when a managed adapter is not configured for the detected project.
 */
export class AdapterNotConfiguredError extends Error {
  constructor(
    readonly adapter: string,
    readonly projectPath: string,
    readonly configPath: string,
  ) {
    super(
      `${adapter} adapter not configured for project at ${projectPath} (config: ${configPath})`,
    );
    this.name = this.constructor.name;
  }
}
