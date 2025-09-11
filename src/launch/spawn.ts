import { execa, ExecaError } from "execa";
import { SpawnError } from "../utils/errors.js";

/**
 * Spawns a child process using execa.
 *
 * @param cmd - The command to execute
 * @param args - Arguments to pass to the command
 * @throws {SpawnError} When the command fails to spawn or exits with non-zero code
 */
export async function spawnProcess(
  cmd: string,
  args: string[],
): Promise<number> {
  try {
    const { exitCode } = await execa(cmd, args, { stdio: "inherit" });
    return exitCode ?? 0;
  } catch (error) {
    // Check if it's an ExecaError (either real instance or mock)
    if (
      error instanceof ExecaError ||
      (error instanceof Error &&
        (error as { name?: string }).name === "ExecaError")
    ) {
      const execaError = error as ExecaError;
      throw new SpawnError(
        cmd,
        execaError.code,
        execaError.exitCode,
        execaError.signal,
        execaError,
      );
    }
    const unknown = error instanceof Error ? error : new Error(String(error));
    throw new SpawnError(cmd, undefined, undefined, undefined, unknown);
  }
}
