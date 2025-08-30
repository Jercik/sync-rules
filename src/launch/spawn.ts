import { execa, type ExecaError } from "execa";
import { SpawnError } from "../utils/errors.ts";

/**
 * Spawns a child process using execa.
 * Returns the exit code on success.
 *
 * @param cmd - The command to execute
 * @param args - Arguments to pass to the command
 * @returns The exit code of the spawned process
 * @throws {SpawnError} When the command fails to spawn or exits with non-zero code
 */
export async function spawnProcess(
  cmd: string,
  args: string[],
): Promise<number> {
  try {
    const result = await execa(cmd, args, {
      stdio: "inherit",
      reject: true,
    });
    return result.exitCode ?? 0;
  } catch (error) {
    // When reject: true, execa throws an ExecaError
    const execaError = error as ExecaError;

    throw new SpawnError(
      cmd,
      execaError.code,
      execaError.exitCode,
      execaError.message,
      execaError,
    );
  }
}
