import { adapterNames } from "../adapters/registry.js";
import { loadConfig } from "../config/loader.js";
import { findProjectForPath } from "../config/config.js";
import { syncProject } from "../core/sync.js";
import { spawnProcess } from "./spawn.js";
import type { AdapterName } from "../config/config.js";
import type { ProjectReport } from "../core/reporting.js";
import { getLogger } from "../utils/log.js";
import {
  AdapterNotConfiguredError,
  ProjectNotFoundError,
} from "../utils/errors.js";
import { basename } from "node:path";

const isOneOf = <T extends readonly string[]>(
  list: T,
  x: string,
): x is T[number] => (list as readonly string[]).includes(x);

const isSupportedAdapter = (name: string): name is AdapterName =>
  isOneOf(adapterNames, name);

async function detectProjectContext(configPath: string) {
  const logger = getLogger("launch");
  logger.debug(
    { evt: "launch.detect.start", configPath, cwd: process.cwd() },
    "Detecting project context",
  );

  const config = await loadConfig(configPath);
  logger.debug(
    { evt: "launch.config.loaded", projectCount: config.projects.length },
    "Config loaded",
  );

  const project = findProjectForPath(process.cwd(), config);

  logger.debug(
    {
      evt: "launch.detect.done",
      projectFound: !!project,
      projectPath: project?.path,
    },
    "Project detection complete",
  );

  return { project, config };
}

export interface LaunchResult {
  projectReport: ProjectReport;
  exitCode: number;
}

/**
 * Launches a target tool/command while ensuring project rules are up-to-date.
 *
 * Behavior:
 * - If the tool is not a managed adapter, it spawns directly.
 * - Otherwise, it loads config, detects the current project, syncs rules
 *   (unless --no-sync is set), and then spawns the tool, returning its exit code.
 *
 * @param command - The executable name (e.g., `claude`).
 * @param args - Arguments to pass through to the spawned tool.
 * @param options - Config path and sync behavior flags.
 * @returns LaunchResult containing ProjectReport and exit code
 * @throws {ConfigNotFoundError} When config file doesn't exist
 * @throws {ConfigParseError} When config file cannot be parsed
 * @throws {SpawnError} When the tool fails to spawn
 */
export async function launchTool(
  command: string,
  args: string[],
  options: {
    configPath: string;
    noSync?: boolean;
  },
): Promise<LaunchResult> {
  const logger = getLogger("launch");
  logger.info({ evt: "launch.start", args, options, command }, "Launching");

  // Extract the base name from the command path (e.g., "claude" from "/path/to/claude")
  const toolName = basename(command);

  if (!isSupportedAdapter(toolName)) {
    logger.info(
      { evt: "launch.unmanaged", command },
      `${command} is not a supported adapter, spawning directly`,
    );
    const exitCode = await spawnProcess(command, args);

    // Return a simple result for unmanaged tools
    return {
      projectReport: {
        projectPath: process.cwd(),
        report: {
          written: [],
        },
      },
      exitCode,
    };
  }

  // Tool name is now validated as a supported adapter
  const adapterName: AdapterName = toolName;
  logger.debug(
    { evt: "launch.adapter.recognized", adapter: adapterName },
    "Adapter recognized",
  );

  let project, config;
  try {
    ({ project, config } = await detectProjectContext(options.configPath));
  } catch (error) {
    logger.error(
      { err: error, evt: "launch.detect.error" },
      "Failed to detect project context",
    );
    throw error;
  }

  // Fail fast if project not found
  if (!project) {
    throw new ProjectNotFoundError(process.cwd(), options.configPath);
  }

  // Fail fast if adapter not configured for project
  if (!project.adapters.includes(adapterName)) {
    throw new AdapterNotConfiguredError(
      adapterName,
      project.path,
      options.configPath,
    );
  }

  let projectReport: ProjectReport;

  if (!options.noSync) {
    logger.debug(
      {
        evt: "launch.sync.start",
        projectPath: project.path,
        adapter: adapterName,
      },
      "Syncing project rules",
    );

    const syncResult = await syncProject(
      project,
      { dryRun: false },
      { rulesSource: config.rulesSource },
    );

    projectReport = {
      projectPath: syncResult.projectPath,
      report: syncResult.report,
    };
  } else {
    logger.debug(
      { evt: "launch.sync.skipped" },
      "Sync skipped (--no-sync flag)",
    );
    // Create a no-op report when sync is skipped
    projectReport = {
      projectPath: project.path,
      report: {
        written: [],
      },
    };
  }

  logger.info(
    { evt: "launch.spawn.start", args, command },
    `Spawning ${command} with args`,
  );
  try {
    const exitCode = await spawnProcess(command, args);
    logger.info(
      { evt: "launch.spawn.done", command, exitCode },
      `${command} exited with code ${exitCode}`,
    );
    return {
      projectReport,
      exitCode,
    };
  } catch (error) {
    logger.error(
      { err: error, evt: "launch.spawn.error", command },
      `Failed to spawn ${command}`,
    );
    throw error;
  }
}
