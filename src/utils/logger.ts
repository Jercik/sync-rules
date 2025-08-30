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
