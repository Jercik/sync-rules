import { execa, type ExecaError } from "execa";
import { SpawnError } from "../utils/errors.js";
import { logger } from "../utils/pino-logger.js";

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
  logger.debug({ args }, `Attempting to spawn process: ${cmd}`);

  try {
    const result = await execa(cmd, args, {
      stdio: "inherit",
    });

    const exitCode = result.exitCode ?? 0;
    logger.debug(`Process ${cmd} completed with exit code ${exitCode}`);
    return exitCode;
  } catch (error) {
    // execa rejects on non-zero exit and throws an ExecaError
    const execaError = error as ExecaError;

    logger.error(
      {
        code: execaError.code,
        exitCode: execaError.exitCode,
        message: execaError.message,
        signal: execaError.signal,
        signalDescription: execaError.signalDescription,
      },
      `Failed to spawn process: ${cmd}`,
    );

    throw new SpawnError(
      cmd,
      execaError.code,
      execaError.exitCode,
      execaError.message,
      execaError,
    );
  }
}
