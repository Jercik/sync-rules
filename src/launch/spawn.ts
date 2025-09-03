import { execa, ExecaError } from "execa";
import { SpawnError } from "../utils/errors.js";
import { getLogger } from "../utils/log.js";

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
  const logger = getLogger("launch:spawn");
  logger.debug(
    { evt: "spawn.start", args, cmd },
    `Attempting to spawn process: ${cmd}`,
  );

  try {
    const { exitCode } = await execa(cmd, args, { stdio: "inherit" });
    const code = exitCode ?? 0;
    logger.debug(
      { evt: "spawn.done", cmd, exitCode: code },
      `Process ${cmd} completed`,
    );
    return code;
  } catch (error) {
    if (error instanceof ExecaError) {
      logger.error(
        {
          evt: "spawn.error",
          cmd,
          code: error.code,
          exitCode: error.exitCode,
          message: error.message,
          stderr: error.stderr,
        },
        `Failed to spawn process: ${cmd}`,
      );
      throw new SpawnError(
        cmd,
        error.code,
        error.exitCode,
        error.message,
        error,
      );
    }
    const unknown = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { evt: "spawn.error", cmd, message: unknown.message },
      `Failed to spawn process: ${cmd}`,
    );
    throw new SpawnError(cmd, undefined, undefined, unknown.message, unknown);
  }
}
