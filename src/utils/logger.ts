/**
 * Logs a message to console if verbose mode is enabled
 * @param message - The message to log
 * @param isVerbose - Whether verbose mode is enabled
 */
export function logMessage(message: string, isVerbose: boolean): void {
  if (isVerbose) {
    console.log(message);
  }
}

/**
 * Type guard to safely check if an error is a Node.js ErrnoException
 * @param error - The error to check
 * @returns true if the error is a NodeJS.ErrnoException
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Ensures that an unknown caught value is an Error object.
 * @param error - The unknown value to ensure is an Error
 * @returns An Error object
 */
export function ensureError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}
