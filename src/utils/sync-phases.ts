import type { ProjectInfo } from "../discovery.ts";
import type { MultiSyncOptions, SyncAction, GlobalFileState } from "../multi-sync.ts";
import { scanAllProjects, getUserConfirmations } from "../multi-sync.ts";
import { generateClaudeMd } from "../generate-claude.ts";
import * as logger from "./core.ts";
import { safeAccess } from "./core.ts";
import { confirm } from "./prompts.ts";
import { logSyncSummary, calculateActionCounts } from "./common-functions.ts";

/**
 * Result of a sync phase.
 */
export interface PhaseResult<T> {
  success: boolean;
  data?: T;
  errors?: number;
  shouldContinue: boolean;
}

/**
 * Result of the preparation phase.
 */
export interface PreparationResult {
  globalFileStates: Map<string, GlobalFileState>;
}

/**
 * Result of the planning phase.
 */
export interface PlanningResult {
  syncActions: SyncAction[];
  userCancelled: boolean;
}

/**
 * Result of the execution phase.
 */
export interface ExecutionResult {
  updates: number;
  additions: number;
  deletions: number;
  skips: number;
  errors: number;
}

/**
 * Phase 1: Preparation - Initialize sync options.
 */
export async function preparationPhase(
  projects: ProjectInfo[],
  options: any,
): Promise<PhaseResult<PreparationResult>> {
  const multiSyncOptions: MultiSyncOptions = {
    rulePatterns: options.rules,
    excludePatterns: options.exclude,
    dryRun: options.dryRun || false,
    autoConfirm: options.autoConfirm || false,
    baseDir: options.baseDir,
  };

  logger.log("\nStarting unified synchronization...");
  
  if (multiSyncOptions.autoConfirm) {
    logger.log(
      "Auto-confirm mode enabled: automatically using newest versions as source of truth.",
    );
  }

  try {
    const globalFileStates = await scanAllProjects(projects, multiSyncOptions);
    
    if (globalFileStates.size === 0) {
      logger.log("No rule files found across any projects.");
      return {
        success: true,
        data: { globalFileStates },
        shouldContinue: false,
      };
    }
    
    return {
      success: true,
      data: { globalFileStates },
      shouldContinue: true,
    };
  } catch (error) {
    logger.error("Error during preparation phase:", error);
    return {
      success: false,
      errors: 1,
      shouldContinue: false,
    };
  }
}

/**
 * Phase 2: Planning - Get user confirmations and build sync plan.
 */
export async function planningPhase(
  projects: ProjectInfo[],
  globalFileStates: Map<string, GlobalFileState>,
  multiSyncOptions: MultiSyncOptions,
): Promise<PhaseResult<PlanningResult>> {
  try {
    const syncActions = await getUserConfirmations(
      globalFileStates,
      null,
      multiSyncOptions,
      projects,
    );
    
    if (syncActions.length === 0) {
      logger.log("No synchronization needed - all files are already up to date.");
      return {
        success: true,
        data: { syncActions: [], userCancelled: false },
        shouldContinue: false,
      };
    }
    
    // Show final summary and get confirmation if in interactive mode
    if (!multiSyncOptions.dryRun && !multiSyncOptions.autoConfirm) {
      const userCancelled = await showSummaryAndConfirm(syncActions);
      if (userCancelled) {
        return {
          success: true,
          data: { syncActions: [], userCancelled: true },
          shouldContinue: false,
        };
      }
    }
    
    return {
      success: true,
      data: { syncActions, userCancelled: false },
      shouldContinue: true,
    };
  } catch (error) {
    logger.error("Error during planning phase:", error);
    return {
      success: false,
      errors: 1,
      shouldContinue: false,
    };
  }
}

/**
 * Shows a summary of planned changes and asks for user confirmation.
 * @returns True if user cancelled, false if they confirmed.
 */
async function showSummaryAndConfirm(syncActions: SyncAction[]): Promise<boolean> {
  const counts = calculateActionCounts(syncActions);
  logSyncSummary(
    "Planned Changes Summary",
    syncActions.length,
    counts.updates,
    counts.additions,
    counts.deletions
  );
  
  const proceedConfirmed = await confirm("\nProceed with these changes?");
  if (!proceedConfirmed) {
    logger.log("Synchronization cancelled by user.");
    return true; // User cancelled
  }
  
  return false; // User confirmed
}

/**
 * Phase 3: Execution - Execute the sync plan.
 */
export async function executionPhase(
  projects: ProjectInfo[],
  syncActions: SyncAction[],
  multiSyncOptions: MultiSyncOptions,
): Promise<PhaseResult<ExecutionResult>> {
  const { executeSyncActions } = await import("../cli.ts");
  
  try {
    const result = await executeSyncActions(
      syncActions,
      multiSyncOptions,
      projects,
    );
    
    logSyncSummary(
      "Synchronization Summary",
      syncActions.length,
      result.updates,
      result.additions,
      result.deletions,
      result.skips,
      result.errors
    );
    
    return {
      success: true,
      data: result,
      shouldContinue: true,
    };
  } catch (error) {
    logger.error("Error during execution phase:", error);
    return {
      success: false,
      errors: 1,
      shouldContinue: false,
    };
  }
}

/**
 * Phase 4: Generation - Generate CLAUDE.md files if requested.
 */
export async function generationPhase(
  projects: ProjectInfo[],
  options: any,
  syncErrors: number,
): Promise<PhaseResult<number>> {
  const shouldGenerateClaude = options.generateClaude !== false;
  
  if (!shouldGenerateClaude) {
    return {
      success: true,
      data: syncErrors > 0 ? 1 : 0,
      shouldContinue: false,
    };
  }
  
  logger.log("\nStarting CLAUDE.md generation for all projects...");
  
  try {
    const genExitCode = await executeClaudeGeneration(projects, options);
    
    const finalExitCode = Math.max(syncErrors > 0 ? 1 : 0, genExitCode);
    
    return {
      success: true,
      data: finalExitCode,
      shouldContinue: false,
    };
  } catch (error) {
    logger.error("Error during generation phase:", error);
    return {
      success: false,
      data: 1,
      shouldContinue: false,
    };
  }
}

/**
 * Execute CLAUDE.md generation for all projects.
 */
async function executeClaudeGeneration(
  projects: ProjectInfo[],
  options: any,
): Promise<number> {
  const multiSyncOptions: MultiSyncOptions = {
    rulePatterns: options.rules,
    excludePatterns: options.exclude,
    dryRun: options.dryRun || false,
    autoConfirm: options.autoConfirm || false,
    baseDir: options.baseDir,
  };

  logger.log(`\nGenerating CLAUDE.md for ${projects.length} projects...`);

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const project of projects) {
    try {
      let content: string;
      if (multiSyncOptions.dryRun) {
        try {
          content = await generateClaudeMd(project.path, multiSyncOptions);
        } catch (genErr) {
          logger.warn(
            `[DRY RUN] Cannot read files in ${project.name} (${genErr instanceof Error ? genErr.message : String(genErr)}), but would generate CLAUDE.md`,
          );
          generated++;
          continue;
        }
        
        const pathModule = await import("node:path");
        const outputPath = pathModule.join(project.path, "CLAUDE.md");
        const destDir = pathModule.dirname(outputPath);
        
        const canWrite = await safeAccess(destDir, (await import("node:fs")).constants.W_OK, "generate CLAUDE.md", project.name);
        
        if (canWrite) {
          logger.log(
            `[DRY RUN] Would generate CLAUDE.md for ${project.name}:\n${content.slice(0, 200)}...`,
          );
          generated++;
        } else {
          logger.warn(
            `[DRY RUN] Would fail to generate CLAUDE.md in ${project.name} - directory is not writable`,
          );
          errors++;
        }
        continue;
      }

      content = await generateClaudeMd(project.path, multiSyncOptions);

      if (!multiSyncOptions.autoConfirm) {
        const proceed = await confirm(
          `Generate CLAUDE.md for ${project.name}?`,
        );
        if (!proceed) {
          logger.log(`Skipped ${project.name}`);
          skipped++;
          continue;
        }
      }

      const fsModule = await import("node:fs");
      const pathModule = await import("node:path");
      const outputPath = pathModule.join(project.path, "CLAUDE.md");
      await fsModule.promises.writeFile(outputPath, content);
      logger.log(`Generated CLAUDE.md in ${project.name}`);
      generated++;
    } catch (err) {
      logger.error(`Error generating for ${project.name}:`, err);
      errors++;
    }
  }

  logger.log(`\nGeneration Summary: ${generated} generated, ${skipped} skipped, ${errors} errors`);

  return errors > 0 ? 1 : 0;
}