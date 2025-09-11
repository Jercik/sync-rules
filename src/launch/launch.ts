import { adapterRegistry } from "../adapters/registry.js";
import { loadConfig } from "../config/loader.js";
import { findProjectForPath } from "../config/config.js";
import { syncProject } from "../core/sync.js";
import { spawnProcess } from "./spawn.js";
import type { AdapterName } from "../adapters/registry.js";
import {
  AdapterNotConfiguredError,
  ConfigNotFoundError,
} from "../utils/errors.js";
import { basename, parse } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

async function detectProjectContext(configPath: string) {
  const config = await loadConfig(configPath);
  const project = findProjectForPath(process.cwd(), config);
  return { project, config };
}

export interface LaunchResult {
  exitCode: number;
}

export interface LaunchOptions {
  configPath: string;
  /**
   * Pre-launch pause to make the console message visible before TUIs clear the screen.
   * Defaults to ~3.5s for human-perceivable dwell time.
   */
  delayMs?: number;
}

const DEFAULT_PRELAUNCH_DELAY_MS = 3500;

async function logAndPause(message: string, delayMs: number): Promise<void> {
  // Avoid fancy formatting to keep output portable and readable.
  // Small unicode icons improve scannability but are optional for plain terminals.
  console.log(message);
  await sleep(delayMs);
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
  // Normalize tool name for cross-platform invocations (e.g., claude.exe/claude.cmd)
  const toolName = parse(basename(command)).name.toLowerCase();
  const delayMs = options.delayMs ?? DEFAULT_PRELAUNCH_DELAY_MS;

  if (!(toolName in adapterRegistry)) {
    const exitCode = await spawnProcess(command, args);
    return { exitCode };
  }

  const adapterName: AdapterName = toolName as AdapterName;

  let project: import("../config/config.js").Project | undefined;
  let config: import("../config/config.js").Config | undefined;
  try {
    ({ project, config } = await detectProjectContext(options.configPath));
  } catch (err) {
    // Missing config: warn, pause, and launch anyway.
    if (err instanceof ConfigNotFoundError) {
      await logAndPause(
        `⚠️  sync-rules: No config found at ${options.configPath}. Launching "${command}" without syncing...`,
        delayMs,
      );
      const exitCode = await spawnProcess(command, args);
      return { exitCode };
    }
    throw err;
  }

  // No project match: warn, pause, and launch anyway.
  if (!project) {
    await logAndPause(
      `⚠️  sync-rules: Current directory is not listed in config (${options.configPath}). Launching "${command}" without syncing...`,
      delayMs,
    );
    const exitCode = await spawnProcess(command, args);
    return { exitCode };
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

  await logAndPause(
    `✅ sync-rules: ${status} for ${project.path}. Launching "${command}"...`,
    delayMs,
  );

  const exitCode = await spawnProcess(command, args);
  return { exitCode };
}
