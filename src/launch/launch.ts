import { adapterNames } from "../adapters/registry.ts";
import { verifyRules, openConfigForEditing } from "../core/verification.ts";
import { loadConfig } from "../config/loader.ts";
import { createPathGuardFromConfig } from "../core/path-guard.ts";
import { findProjectForPath } from "../config/config.ts";
import { syncProject } from "../core/sync.ts";
import { promptYesNo } from "./prompts.ts";
import { spawnProcess } from "./spawn.ts";
import type { AdapterName } from "../config/config.ts";

const isSupportedAdapter = (name: string): name is AdapterName =>
  adapterNames.includes(name as AdapterName);

async function detectProjectContext(configPath: string) {
  const config = await loadConfig(configPath);
  const pathGuard = createPathGuardFromConfig(config);
  const project = findProjectForPath(process.cwd(), config);

  return { pathGuard, project };
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
  },
): Promise<SyncCheckResult> {
  if (options.noSync) {
    return { status: "skipped" };
  }

  if (options.force) {
    const syncResult = await syncProject(project, {
      verbose: options.verbose,
      pathGuard,
    });
    return {
      status: "forced",
      fileCount: syncResult.report.written.length,
    };
  }

  // Verify rules are up-to-date
  const result = await verifyRules(project.path, toolName, project.rules);

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
): Promise<SyncAction> {
  const syncResult = await syncProject(project, {
    verbose,
    pathGuard,
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
  // Check if tool has corresponding adapter
  if (!isSupportedAdapter(command)) {
    // Not a supported adapter, spawn directly
    return await spawnProcess(command, args);
  }

  // Command is now validated as a supported adapter
  const adapterName: AdapterName = command;

  // Load config, create guard, detect cwd project
  const { pathGuard, project } = await detectProjectContext(options.configPath);

  // Check configuration status
  const configStatus = summarizeConfiguration(
    project,
    adapterName,
    options.configPath,
  );

  // Handle missing project
  if (configStatus.status === "missing-project") {
    console.log(`Project at ${configStatus.currentPath} not found in config.`);

    if (
      await promptYesNo(
        "Would you like to open the config file to add it? [Y/n]",
      )
    ) {
      console.log("Opening config file in default editor...");
      const opened = await openConfigForEditing(configStatus.configPath!);
      if (opened) {
        console.log("Please re-run the command after updating the config.");
        return 0;
      }
    }

    // Continue without verification if project not found
    return await spawnProcess(command, args);
  }

  // Handle missing adapter
  if (configStatus.status === "missing-adapter") {
    console.log(
      `Warning: ${configStatus.toolName} adapter not configured for this project.`,
    );

    if (
      await promptYesNo(
        `Add "${configStatus.toolName}" to adapters in config? [Y/n]`,
      )
    ) {
      console.log("Opening config file in default editor...");
      const opened = await openConfigForEditing(configStatus.configPath!);
      if (opened) {
        console.log("Please re-run the command after updating the config.");
        return 0;
      }
    }
  }

  // If no project found (should not happen after config check), spawn tool without verification
  if (!project) {
    return await spawnProcess(command, args);
  }

  // Check sync status
  const syncStatus = await assessSyncState(
    project,
    adapterName,
    pathGuard,
    options,
  );

  // Handle sync status
  switch (syncStatus.status) {
    case "forced":
      if (syncStatus.fileCount && syncStatus.fileCount > 0) {
        console.log(
          `✓ Synced ${syncStatus.fileCount} file${syncStatus.fileCount === 1 ? "" : "s"}`,
        );
      }
      break;

    case "out-of-sync":
      // Show sync issues
      if (options.verbose && syncStatus.issues) {
        console.log(`Rules are out of sync:`);
        syncStatus.issues.forEach((issue) => {
          console.log(`  - ${issue.type}: ${issue.path}`);
        });
      } else if (syncStatus.issues) {
        const issueCount = syncStatus.issues.length;
        console.log(
          `Rules out of sync (${issueCount} issue${issueCount === 1 ? "" : "s"})`,
        );
      }

      // Prompt for sync
      if (await promptYesNo("Sync now? [Y/n]")) {
        const syncAction = await performSync(
          project,
          pathGuard,
          options.verbose,
        );
        if (syncAction.fileCount && syncAction.fileCount > 0) {
          console.log(
            `✓ Synced ${syncAction.fileCount} file${syncAction.fileCount === 1 ? "" : "s"}`,
          );
        }
      }
      break;

    case "up-to-date":
      if (options.verbose) {
        console.log(`✓ Rules up to date`);
      }
      break;

    case "skipped":
      // No sync performed
      break;
  }

  // Spawn the actual tool
  return await spawnProcess(command, args);
}
