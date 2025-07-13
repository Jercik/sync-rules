import type { ProjectInfo } from "../discovery.ts";
import type { MultiSyncOptions, SyncAction, GlobalFileState } from "../multi-sync.ts";
import type { Manifest } from "./manifest-validator.ts";
import { handleManifestSync, scanAllProjects, getUserConfirmations, handleExtraneousFiles } from "../multi-sync.ts";
import type { MultiSyncOptions as MSO } from "../multi-sync.ts";
import { generateClaudeMd } from "../generate-claude.ts";
import * as logger from "./core.ts";
import { confirm } from "./prompts.ts";

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
  consistentManifest: Manifest | null;
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
 * Phase 1: Preparation - Initialize sync options and handle manifest synchronization.
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
    // Handle manifest sync first
    const consistentManifest = await handleManifestSync(projects, multiSyncOptions);
    
    // Scan all projects and build global file state
    const globalFileStates = await scanAllProjects(projects, multiSyncOptions);
    
    if (globalFileStates.size === 0) {
      logger.log("No rule files found across any projects.");
      return {
        success: true,
        data: { consistentManifest, globalFileStates },
        shouldContinue: false,
      };
    }
    
    return {
      success: true,
      data: { consistentManifest, globalFileStates },
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
  consistentManifest: Manifest | null,
  multiSyncOptions: MultiSyncOptions,
): Promise<PhaseResult<PlanningResult>> {
  try {
    const syncActions = await getUserConfirmations(
      globalFileStates,
      consistentManifest,
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
  logger.log(`\n=== Planned Changes Summary ===`);
  logger.log(`Total actions: ${syncActions.length}`);
  
  const updates = syncActions.filter((a) => a.type === "update").length;
  const additions = syncActions.filter((a) => a.type === "add").length;
  const deletions = syncActions.filter((a) => a.type === "delete").length;
  
  logger.log(`Updates: ${updates}`);
  logger.log(`Additions: ${additions}`);
  logger.log(`Deletions: ${deletions}`);
  
  const proceedConfirmed = await confirm("\nProceed with these changes?");
  if (!proceedConfirmed) {
    logger.log("Synchronization cancelled by user.");
    return true; // User cancelled
  }
  
  return false; // User confirmed
}

/**
 * Phase 3: Execution - Execute the sync plan and handle extraneous files.
 */
export async function executionPhase(
  projects: ProjectInfo[],
  syncActions: SyncAction[],
  consistentManifest: Manifest | null,
  multiSyncOptions: MultiSyncOptions,
): Promise<PhaseResult<ExecutionResult>> {
  // Import executeSyncActions dynamically to avoid circular dependency
  const { executeSyncActions } = await import("../cli.ts");
  
  try {
    // Execute the sync plan
    const result = await executeSyncActions(
      syncActions,
      multiSyncOptions,
      projects,
    );
    
    // Report results
    logger.log("\n=== Synchronization Summary ===");
    logger.log(`Total actions: ${syncActions.length}`);
    logger.log(`Updates: ${result.updates}`);
    logger.log(`Additions: ${result.additions}`);
    logger.log(`Deletions: ${result.deletions}`);
    logger.log(`Skipped: ${result.skips}`);
    
    if (result.errors > 0) {
      logger.warn(
        `\n⚠️  Synchronization complete with ${result.errors} errors detected.`,
      );
      logger.warn("Please review the affected files and resolve any issues.");
    } else {
      logger.log("\n✅ Synchronization completed successfully!");
    }
    
    // Handle extraneous files based on manifest conditions
    if (consistentManifest) {
      const extraneousActions = await handleExtraneousFiles(projects, consistentManifest, multiSyncOptions);
      if (extraneousActions.length > 0) {
        const extraneousResult = await executeSyncActions(extraneousActions, multiSyncOptions, projects);
        result.deletions += extraneousResult.deletions;
        result.errors += extraneousResult.errors;
      }
    }
    
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
    
    // Use Math.max to preserve the highest exit code (1 = error, 0 = success)
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
      // In dry-run mode, wrap generateClaudeMd in try-catch to handle permission errors gracefully
      let content: string;
      if (multiSyncOptions.dryRun) {
        try {
          content = await generateClaudeMd(project.path, multiSyncOptions);
        } catch (genErr) {
          // In dry-run mode, if we can't read files due to permissions, simulate success
          logger.warn(
            `[DRY RUN] Cannot read files in ${project.name} (${genErr instanceof Error ? genErr.message : String(genErr)}), but would generate CLAUDE.md`,
          );
          generated++;
          continue;
        }
        
        // Check write permissions on the project directory
        const fsModule = await import("node:fs");
        try {
          await fsModule.promises.access(project.path, fsModule.constants.W_OK);
          logger.log(
            `[DRY RUN] Would generate CLAUDE.md for ${project.name}:\n${content.slice(0, 200)}...`,
          );
          generated++;
        } catch (permErr) {
          logger.warn(
            `[DRY RUN] Would fail to generate CLAUDE.md in ${project.name} - directory is not writable`,
          );
          errors++;
        }
        continue;
      }

      // Normal mode - let errors propagate to outer catch
      content = await generateClaudeMd(project.path, multiSyncOptions);

      if (!multiSyncOptions.autoConfirm) {
        const { confirm } = await import("./prompts.ts");
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

/**
 * Handle extraneous files when no sync is needed.
 * This is a special case that runs when there are no regular sync actions.
 */
export async function handleExtraneousFilesPhase(
  projects: ProjectInfo[],
  consistentManifest: Manifest | null,
  multiSyncOptions: MultiSyncOptions,
): Promise<PhaseResult<ExecutionResult>> {
  if (!consistentManifest) {
    return {
      success: true,
      data: { updates: 0, additions: 0, deletions: 0, skips: 0, errors: 0 },
      shouldContinue: true,
    };
  }
  
  // Import executeSyncActions dynamically
  const { executeSyncActions } = await import("../cli.ts");
  
  try {
    const extraneousActions = await handleExtraneousFiles(projects, consistentManifest, multiSyncOptions);
    if (extraneousActions.length > 0) {
      const result = await executeSyncActions(extraneousActions, multiSyncOptions, projects);
      return {
        success: result.errors === 0,
        data: result,
        shouldContinue: true,
      };
    }
    
    return {
      success: true,
      data: { updates: 0, additions: 0, deletions: 0, skips: 0, errors: 0 },
      shouldContinue: true,
    };
  } catch (error) {
    logger.error("Error handling extraneous files:", error);
    return {
      success: false,
      errors: 1,
      shouldContinue: false,
    };
  }
}