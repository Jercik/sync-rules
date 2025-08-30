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

  /**
   * Returns a formatted string representation of the error including context details.
   * Example:
   *   ✗ Project: /path | Adapter: claude | Action: write | Path: rules.md
   *     └─ Failed to write file
   */
  toFormattedString(): string {
    let message = "✗";
    if (this.details.project) message += ` Project: ${this.details.project}`;
    if (this.details.adapter) message += ` | Adapter: ${this.details.adapter}`;
    if (this.details.action) message += ` | Action: ${this.details.action}`;
    if (this.details.path) message += ` | Path: ${this.details.path}`;
    message += `\n  └─ ${this.message}`;
    return message;
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
        ? `"${command}" not found on PATH. Install it or adjust your alias.`
        : message || `Failed to launch "${command}"`;

    super(baseMessage, { cause });
    this.name = this.constructor.name;
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
  }
}

/**
 * Error thrown when attempting to open a file in the user's editor fails.
 */
export class EditorOpenError extends Error {
  readonly path: string;
  readonly originalError?: Error;

  constructor(path: string, originalError?: Error) {
    super(
      originalError
        ? `Failed to open editor for ${path}: ${originalError.message}`
        : `Failed to open editor for ${path}`,
      { cause: originalError },
    );
    this.name = this.constructor.name;
    this.path = path;
    this.originalError = originalError;
  }
}
