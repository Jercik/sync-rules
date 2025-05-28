import { execa } from "execa";
import * as logger from "./core.ts";

let gitVersionChecked = false;
let isGitAvailable = false;

/**
 * Checks if Git is installed, accessible in the system PATH, and meets minimum version requirements.
 * The result is cached to avoid redundant checks during a single execution of the CLI.
 *
 * @returns A promise that resolves to `true` if Git is available and meets criteria, `false` otherwise.
 * @example
 * if (await checkGitAvailability()) {
 *   console.log("Git is ready.");
 * } else {
 *   console.error("Git is not available or version is too old.");
 * }
 */
export async function checkGitAvailability(): Promise<boolean> {
  if (gitVersionChecked) {
    return isGitAvailable;
  }

  try {
    const { stdout } = await execa("git", ["--version"]);
    isGitAvailable = true;
    gitVersionChecked = true;
    return true;
  } catch (error) {
    logger.warn(
      "Git command not found or failed to execute. Git features will be unavailable.",
      error,
    );
    isGitAvailable = false;
    gitVersionChecked = true;
    return false;
  }
}

import { promises as fs } from "node:fs"; // For writing merge-file output

/**
 * Executes `git merge-file` to perform a three-way merge and writes the output (including conflict markers)
 * to the `localPath` file. This is a non-interactive merge strategy.
 *
 * @param localPath Path to the current version of the file (target). This file will be **overwritten** with the merge result.
 * @param remotePath Path to the incoming version of the file (source).
 * @param basePath Path to the common ancestor version of the file.
 * @returns A promise that resolves to an object `{ conflicts: boolean }`.
 *          `conflicts` is `true` if `git merge-file` exits with a non-zero status code (indicating conflicts),
 *          `false` otherwise.
 * @throws If `git merge-file` command execution itself fails (e.g., command not found, invalid arguments before execution)
 *         or if writing the output to `localPath` fails. Note that an exit code indicating conflicts is not
 *         treated as a thrown error by this function itself, but is reflected in the `conflicts` boolean.
 * @example
 * const result = await runGitMergeFile("target.txt", "source.txt", "base.txt");
 * if (result.conflicts) {
 *   console.warn("Merge conflicts found in target.txt!");
 * } else {
 *   console.log("Merge successful.");
 * }
 */
export async function runGitMergeFile(
  localPath: string,
  remotePath: string,
  basePath: string,
): Promise<{ conflicts: boolean }> {
  logger.debug(
    `Running git merge-file: local="${localPath}", remote="${remotePath}", base="${basePath}"`,
  );
  try {
    const { stdout, exitCode } = await execa("git", [
      "merge-file",
      "-p", // Output to stdout
      localPath,
      basePath,
      remotePath,
    ]);
    // exitCode 0 means merge successful without conflicts.
    // exitCode > 0 means conflicts.
    // exitCode < 0 means signal termination (should be caught by execa as error).
    await fs.writeFile(localPath, stdout); // Overwrite localPath with merge result
    logger.debug(
      `git merge-file completed. Exit code: ${exitCode}. Output written to ${localPath}`,
    );
    return { conflicts: exitCode !== 0 };
  } catch (error) {
    // This catch block is for when execa itself throws (e.g., command not found, signal)
    // or if git merge-file returns a very high error code that execa treats as failure.
    // Standard conflict exit codes (like 1) from `git merge-file` are not thrown by execa by default
    // if `reject: false` is not used, but we check `exitCode` above.
    // If `error.exitCode` is available, it means the command ran but exited with error.
    if (
      error instanceof Error &&
      "exitCode" in error &&
      typeof error.exitCode === "number" &&
      error.exitCode > 0
    ) {
      // This means conflicts occurred, and merge-file wrote conflict markers to stdout.
      // We still attempt to write this output to the file.
      const conflictOutput =
        "stdout" in error && typeof error.stdout === "string"
          ? error.stdout
          : "";
      await fs.writeFile(localPath, conflictOutput);
      logger.warn(
        `git merge-file resulted in conflicts. Output with markers written to ${localPath}.`,
      );
      return { conflicts: true };
    }
    logger.error("git merge-file command execution failed:", error);
    throw error;
  }
}
