import { execa } from "execa";
import * as logger from "./core.ts";

let vscodeVersionChecked = false;
let isVSCodeAvailable = false;

/**
 * Checks if VS Code CLI is installed, accessible in the system PATH, and can be used for merging.
 * The result is cached to avoid redundant checks during a single execution of the CLI.
 *
 * @returns A promise that resolves to `true` if VS Code CLI is available, `false` otherwise.
 * @example
 * if (await checkVSCodeAvailability()) {
 *   console.log("VS Code CLI is ready for merging.");
 * } else {
 *   console.error("VS Code CLI is not available.");
 * }
 */
export async function checkVSCodeAvailability(): Promise<boolean> {
  if (vscodeVersionChecked) {
    return isVSCodeAvailable;
  }

  try {
    const { stdout } = await execa("code", ["--version"]);
    isVSCodeAvailable = true;
    vscodeVersionChecked = true;
    logger.debug(
      `VS Code CLI is available. Version info: ${stdout.split("\n")[0]}`,
    );
    return true;
  } catch (error) {
    logger.warn(
      "VS Code CLI command not found or failed to execute. VS Code merge features will be unavailable.",
      error,
    );
    isVSCodeAvailable = false;
    vscodeVersionChecked = true;
    return false;
  }
}

/**
 * Opens a file with conflict markers in VS Code for manual conflict resolution.
 * This function is called after `git merge-file` has detected conflicts and written
 * conflict markers to the target file.
 *
 * @param conflictFilePath Path to the file containing conflict markers that needs resolution.
 * @returns A promise that resolves when the user completes conflict resolution in VS Code.
 * @throws If VS Code CLI exits with a non-zero status code, indicating an error or that the user aborted.
 * @remarks This opens the single conflict-marked file in VS Code for manual editing.
 *          The `--wait` flag ensures the CLI blocks until the user saves and closes the file.
 *          VS Code will automatically detect and highlight the conflict markers for easy resolution.
 */
export async function runVSCodeConflictResolution(
  conflictFilePath: string,
): Promise<void> {
  logger.debug(
    `Opening conflict file in VS Code for resolution: ${conflictFilePath}`,
  );

  try {
    // Open the conflict-marked file in VS Code and wait for user to resolve
    await execa(
      "code",
      [
        conflictFilePath,
        "--wait", // Block until file is saved and closed
      ],
      { stdio: "inherit" }, // Inherit stdio to show VS Code output
    );

    logger.debug(
      `VS Code conflict resolution completed for ${conflictFilePath}.`,
    );
  } catch (error) {
    logger.error(
      `VS Code conflict resolution failed or was cancelled for ${conflictFilePath}. Please check the file for its current state.`,
      error,
    );
    // VS Code might exit with non-zero if user cancels or there are issues
    throw error;
  }
}
