import { adapterNames } from "../adapters/registry.js";
import { verifyRules } from "../core/verification.js";
import { loadConfig } from "../config/loader.js";
import { createPathGuardFromConfig } from "../core/path-guard.js";
import { findProjectForPath } from "../config/config.js";
import { syncProject } from "../core/sync.js";
import { spawnProcess } from "./spawn.js";
import type { AdapterName } from "../config/config.js";
import { logger } from "../utils/pino-logger.js";
import { basename } from "node:path";

const isSupportedAdapter = (name: string): name is AdapterName =>
  adapterNames.includes(name as AdapterName);

async function detectProjectContext(configPath: string) {
  logger.debug({ configPath, cwd: process.cwd() }, "Detecting project context");

  const config = await loadConfig(configPath);
  logger.debug({ projectCount: config.projects.length }, "Config loaded");

  const pathGuard = createPathGuardFromConfig(config);
  const project = findProjectForPath(process.cwd(), config);

  logger.debug(
    {
      projectFound: !!project,
      projectPath: project?.path,
    },
    "Project detection complete",
  );

  return { pathGuard, project, config };
}

// Result types for decoupled logic
interface ConfigurationCheckResult {
  status: "missing-project" | "missing-adapter" | "ok";
  currentPath?: string;
  toolName?: string;
  configPath?: string;
}

interface SyncCheckResult {
  status: "forced" | "out-of-sync" | "up-to-date" | "skipped";
  issues?: Array<{ type: string; path: string }>;
  fileCount?: number;
}

interface SyncAction {
  type: "sync" | "skip";
  fileCount?: number;
}

/**
 * Summarizes configuration status without performing I/O
 */
function summarizeConfiguration(
  project: ReturnType<typeof findProjectForPath>,
  toolName: AdapterName,
  configPath: string,
): ConfigurationCheckResult {
  if (!project) {
    return {
      status: "missing-project",
      currentPath: process.cwd(),
      configPath,
    };
  }

  if (!project.adapters.includes(toolName)) {
    return {
      status: "missing-adapter",
      toolName,
      configPath,
    };
  }

  return { status: "ok" };
}

/**
 * Assesses sync state and performs sync if needed, returning results
 */
async function assessSyncState(
  project: NonNullable<ReturnType<typeof findProjectForPath>>,
  toolName: AdapterName,
  pathGuard: ReturnType<typeof createPathGuardFromConfig>,
  options: {
    noSync?: boolean;
    force?: boolean;
    verbose?: boolean;
    rulesSource?: string;
  },
): Promise<SyncCheckResult> {
  if (options.noSync) {
    return { status: "skipped" };
  }

  if (options.force) {
    const syncResult = await syncProject(project, {
      verbose: options.verbose,
      pathGuard,
      rulesSource: options.rulesSource,
    });
    return {
      status: "forced",
      fileCount: syncResult.report.written.length,
    };
  }

  // Verify rules are up-to-date
  const result = await verifyRules(
    project.path,
    toolName,
    project.rules,
    options.rulesSource,
  );

  if (!result.synced) {
    return {
      status: "out-of-sync",
      issues: result.issues,
    };
  }

  return { status: "up-to-date" };
}

/**
 * Performs sync action and returns the result
 */
async function performSync(
  project: NonNullable<ReturnType<typeof findProjectForPath>>,
  pathGuard: ReturnType<typeof createPathGuardFromConfig>,
  verbose?: boolean,
  rulesSource?: string,
): Promise<SyncAction> {
  const syncResult = await syncProject(project, {
    verbose,
    pathGuard,
    rulesSource,
  });

  return {
    type: "sync",
    fileCount: syncResult.report.written.length,
  };
}

/**
 * Launches a target tool/command while ensuring project rules are up-to-date.
 *
 * Behavior:
 * - If the tool is not a managed adapter, it spawns directly.
 * - Otherwise, it loads config, detects the current project, verifies/syncs rules
 *   according to flags, and then spawns the tool, returning its exit code.
 *
 * @param command - The executable name (e.g., `claude`).
 * @param args - Arguments to pass through to the spawned tool.
 * @param options - Config path and sync behavior flags.
 * @returns The exit code of the spawned process
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
    force?: boolean;
    verbose?: boolean;
  },
): Promise<number> {
  logger.info({ args, options }, `Launching tool: ${command}`);

  // Extract the base name from the command path (e.g., "claude" from "/path/to/claude")
  const toolName = basename(command);

  // Check if tool has corresponding adapter
  if (!isSupportedAdapter(toolName)) {
    logger.info(`${command} is not a supported adapter, spawning directly`);
    // Not a supported adapter, spawn directly
    return await spawnProcess(command, args);
  }

  // Tool name is now validated as a supported adapter
  const adapterName: AdapterName = toolName;
  logger.debug(`Adapter ${adapterName} recognized`);

  // Load config, create guard, detect cwd project
  let pathGuard, project, config;
  try {
    ({ pathGuard, project, config } = await detectProjectContext(
      options.configPath,
    ));
  } catch (error) {
    logger.error(error, "Failed to detect project context");
    throw error;
  }

  // Check configuration status
  const configStatus = summarizeConfiguration(
    project,
    adapterName,
    options.configPath,
  );

  // Handle missing project
  if (configStatus.status === "missing-project") {
    logger.warn(
      configStatus,
      `Project at ${configStatus.currentPath} not found in config`,
    );
    console.log(`Project at ${configStatus.currentPath} not found in config.`);
    // Continue without verification if project not found
    return await spawnProcess(command, args);
  }

  // Handle missing adapter
  if (configStatus.status === "missing-adapter") {
    logger.error(
      configStatus,
      `Adapter ${configStatus.toolName} not configured for project`,
    );
    console.error(
      `Error: ${configStatus.toolName} adapter not configured for this project.`,
    );
    console.error(
      `Add "${configStatus.toolName}" to the adapters list in ${configStatus.configPath}`,
    );
    return 1;
  }

  // If no project found (should not happen after config check), spawn tool without verification
  if (!project) {
    logger.warn(
      "No project found after config check, spawning without verification",
    );
    return await spawnProcess(command, args);
  }

  // Check sync status
  logger.debug(
    { projectPath: project.path, adapter: adapterName },
    "Assessing sync state",
  );
  const syncStatus = await assessSyncState(project, adapterName, pathGuard, {
    ...options,
    rulesSource: config.rulesSource,
  });
  logger.debug(syncStatus, "Sync status assessed");

  // Handle sync status
  switch (syncStatus.status) {
    case "forced":
      if (syncStatus.fileCount && syncStatus.fileCount > 0) {
        logger.info(
          { fileCount: syncStatus.fileCount },
          `Force sync completed`,
        );
        console.log(
          `✓ Synced ${syncStatus.fileCount} file${syncStatus.fileCount === 1 ? "" : "s"}`,
        );
      }
      break;

    case "out-of-sync": {
      // Show sync issues
      logger.info({ issues: syncStatus.issues }, "Rules out of sync");
      if (options.verbose && syncStatus.issues) {
        console.log(`Rules are out of sync:`);
        syncStatus.issues.forEach((issue) => {
          console.log(`  - ${issue.type}: ${issue.path}`);
        });
      } else if (syncStatus.issues) {
        const issueCount = syncStatus.issues.length;
        console.log(
          `Rules out of sync (${issueCount} issue${issueCount === 1 ? "" : "s"}). Syncing...`,
        );
      }

      // Automatically sync
      logger.debug("Starting automatic sync");
      const syncAction = await performSync(
        project,
        pathGuard,
        options.verbose,
        config.rulesSource,
      );
      logger.info(syncAction, "Sync completed");
      if (syncAction.fileCount && syncAction.fileCount > 0) {
        console.log(
          `✓ Synced ${syncAction.fileCount} file${syncAction.fileCount === 1 ? "" : "s"}`,
        );
      }
      break;
    }

    case "up-to-date":
      logger.debug("Rules are up to date");
      if (options.verbose) {
        console.log(`✓ Rules up to date`);
      }
      break;

    case "skipped":
      logger.debug("Sync skipped (--no-sync flag)");
      // No sync performed
      break;
  }

  // Spawn the actual tool
  logger.info({ args }, `Spawning ${command} with args`);
  try {
    const exitCode = await spawnProcess(command, args);
    logger.info(`${command} exited with code ${exitCode}`);
    return exitCode;
  } catch (error) {
    logger.error(error, `Failed to spawn ${command}`);
    throw error;
  }
}
