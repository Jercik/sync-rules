import { adapterRegistry } from "../adapters/registry.js";
import type { AdapterName } from "../adapters/registry.js";
import { loadConfig } from "../config/loader.js";
import { findProjectForPath } from "../config/config.js";
import { syncProject } from "../core/sync.js";
import { spawnProcess } from "./spawn.js";
import {
  AdapterNotConfiguredError,
  ConfigNotFoundError,
} from "../utils/errors.js";
import { parse } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export interface LaunchResult {
  exitCode: number;
}

export interface LaunchOptions {
  configPath: string;
  /**
   * Pre-launch pause to make the console message visible before TUIs clear the screen.
   * Defaults to ~3.5s for human-perceivable dwell time in TTY, 0 in CI/non-TTY.
   */
  delayMs?: number;
  /**
   * If true (default), allow pressing any key to skip the pre-launch delay.
   * Has effect only when running in a TTY.
   */
  skipOnKeypress?: boolean;
}

// Default: pause only when interactive & not CI
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
const isInteractive = !!process.stdin.isTTY;
const DEFAULT_PRELAUNCH_DELAY_MS = isInteractive && !process.env.CI ? 3500 : 0;

function normalizeTool(command: string): string {
  // parse().name strips common Windows extensions (".exe",".cmd",".bat") via ext,
  // which is what we want for adapter detection.
  return parse(command).name.toLowerCase();
}

async function logAndPause(
  message: string,
  delayMs: number,
  { skipOnKeypress = true }: { skipOnKeypress?: boolean } = {},
): Promise<void> {
  const allowSkip = delayMs > 0 && isInteractive && skipOnKeypress;
  console.log(message + (allowSkip ? "\nPress any key to launch now…" : ""));
  if (delayMs <= 0) return;
  if (!allowSkip) {
    await sleep(delayMs);
    return;
  }

  const stdin = process.stdin as NodeJS.ReadStream & {
    setRawMode?: (b: boolean) => void;
    isRaw?: boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
  const wasRaw = !!stdin.isRaw;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  stdin.setRawMode?.(true);
  stdin.resume();

  const keypress = new Promise<void>((resolve) => {
    stdin.once("data", (buf: Buffer) => {
      // Resolve regardless of key; if it's Ctrl+C (0x03), forward SIGINT too.
      if (buf.length && buf[0] === 0x03) {
        try {
          process.kill(process.pid, "SIGINT");
        } catch {
          // Ignore errors when sending SIGINT
        }
      }
      resolve();
    });
  });

  const ac = new AbortController();
  const sleeping = sleep(delayMs, undefined, { signal: ac.signal }).catch(
    (e: unknown) => {
      // Ignore AbortError which we trigger when a key is pressed
      if (e && typeof e === "object" && (e as Error).name === "AbortError")
        return;
      throw e;
    },
  );

  await Promise.race([keypress, sleeping]);
  ac.abort();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  stdin.setRawMode?.(wasRaw);
  stdin.pause();
}

async function pauseAndSpawn(
  message: string,
  delayMs: number,
  skipOnKeypress: boolean,
  cmd: string,
  args: string[],
): Promise<LaunchResult> {
  await logAndPause(message, delayMs, { skipOnKeypress });
  return { exitCode: await spawnProcess(cmd, args) };
}

/**
 * Launches a target tool/command while ensuring project rules are up-to-date.
 *
 * Behavior:
 * - If the tool is not a managed adapter, it spawns directly.
 * - Otherwise, it loads config, detects the current project, optionally syncs rules,
 *   and then spawns the tool.
 *
 * @param command - The executable name (e.g., `claude`).
 * @param args - Arguments to pass through to the spawned tool.
 * @param options - Config path and sync behavior flags.
 * @throws {ConfigNotFoundError} When config file doesn't exist
 * @throws {ConfigParseError} When config file cannot be parsed
 * @throws {SpawnError} When the tool fails to spawn
 */
export async function launchTool(
  command: string,
  args: string[],
  options: LaunchOptions,
): Promise<LaunchResult> {
  const toolName = normalizeTool(command);
  const delayMs = options.delayMs ?? DEFAULT_PRELAUNCH_DELAY_MS;
  const skipOnKeypress = options.skipOnKeypress ?? true;

  if (!Object.hasOwn(adapterRegistry, toolName)) {
    return { exitCode: await spawnProcess(command, args) };
  }

  const adapterName = toolName as AdapterName;

  // Managed tool: try config/project detection
  let config: import("../config/config.js").Config | undefined;
  let project: import("../config/config.js").Project | undefined;
  try {
    config = await loadConfig(options.configPath);
    project = findProjectForPath(process.cwd(), config);
  } catch (err) {
    if (err instanceof ConfigNotFoundError) {
      return await pauseAndSpawn(
        `⚠️  sync-rules: No config found at ${options.configPath}. Launching "${command}" without syncing...`,
        delayMs,
        skipOnKeypress,
        command,
        args,
      );
    }
    throw err;
  }

  if (!project) {
    return await pauseAndSpawn(
      `⚠️  sync-rules: Current directory is not listed in config (${options.configPath}). Launching "${command}" without syncing...`,
      delayMs,
      skipOnKeypress,
      command,
      args,
    );
  }

  if (!project.adapters.includes(adapterName)) {
    throw new AdapterNotConfiguredError(
      adapterName,
      project.path,
      options.configPath,
    );
  }

  const result = await syncProject(project, { dryRun: false }, config);
  const changed = result.report.written.length;
  const status =
    changed > 0
      ? `Synchronized ${String(changed)} file${changed === 1 ? "" : "s"}`
      : "Rules already up to date";

  return await pauseAndSpawn(
    `✅ sync-rules: ${status} for ${project.path}. Launching "${command}"...`,
    delayMs,
    skipOnKeypress,
    command,
    args,
  );
}
