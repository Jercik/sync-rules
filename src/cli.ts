import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import * as logger from "./utils/core.ts";
import { scan } from "./scan.ts";
import type { ScanOptions, FileInfo } from "./scan.ts";
import { mergeFiles } from "./merge.ts";
import type { MergeOptions } from "./merge.ts";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Validates the source and destination directory arguments.
 * Checks if directories exist, are accessible, and are not the same.
 *
 * @param src Source directory path
 * @param dst Destination directory path
 * @throws Error if validation fails
 */
async function validateDirectories(src: string, dst: string): Promise<void> {
  // Resolve to absolute paths for comparison
  const srcAbsolute = path.resolve(src);
  const dstAbsolute = path.resolve(dst);

  // Check if source and destination are the same
  if (srcAbsolute === dstAbsolute) {
    throw new Error("Source and destination directories cannot be the same");
  }

  // Check if source directory exists and is a directory
  try {
    const srcStat = await fs.stat(srcAbsolute);
    if (!srcStat.isDirectory()) {
      throw new Error(`Source path "${src}" is not a directory`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Source directory "${src}" does not exist`);
    }
    throw new Error(
      `Cannot access source directory "${src}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Check if destination directory exists, create if it doesn't
  try {
    const dstStat = await fs.stat(dstAbsolute);
    if (!dstStat.isDirectory()) {
      throw new Error(
        `Destination path "${dst}" exists but is not a directory`,
      );
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Destination doesn't exist, try to create it
      try {
        await fs.mkdir(dstAbsolute, { recursive: true });
        logger.log(`Created destination directory: ${dst}`);
      } catch (createError) {
        throw new Error(
          `Cannot create destination directory "${dst}": ${createError instanceof Error ? createError.message : String(createError)}`,
        );
      }
    } else {
      throw new Error(
        `Cannot access destination directory "${dst}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Test write permissions on destination
  try {
    await fs.access(dstAbsolute, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`No write permission for destination directory "${dst}"`);
  }
}

/**
 * Main entry point for the `sync-rules` CLI application.
 * Parses command-line arguments, orchestrates the scanning and merging processes,
 * and handles overall application flow and error reporting.
 *
 * @param argv An array of command-line arguments, typically `process.argv.slice(2)`.
 * @returns A promise that resolves when the command processing is complete.
 *          The process will exit with appropriate status codes:
 *          - 0: Success, no conflicts.
 *          - 1: Success, but with merge conflicts.
 *          - 2: Error during processing.
 *          - Commander.js also handles its own exit codes for argument errors.
 */
export async function main(argv: string[]) {
  const program = new Command();
  const version = packageJson.version || "unknown";

  program
    .name("sync-rules")
    .version(version, "-v, --version", "Output the current version")
    .description(
      "CLI tool to synchronize agent coding-tool rule files between projects.",
    )
    .argument("<src>", "Source directory path")
    .argument("<dst>", "Destination directory path")
    .option(
      "--rulesDir <names...>",
      "Specify rule directory names (e.g., .clinerules .cursorrules)",
      [".clinerules", ".cursorrules", ".kilocode"],
    )
    .option(
      "--exclude <patterns...>",
      "Exclude patterns (directories/files to skip)",
      ["memory-bank", "node_modules", ".git"],
    )
    .option("--dry", "Perform a dry run without actual changes")
    .option("--verbose", "Enable verbose logging")
    .action(async (src, dst, options) => {
      logger.setVerbose(options.verbose); // Set verbosity early

      logger.log("Source Directory:", src);
      logger.log("Destination Directory:", dst);
      if (options.verbose) {
        logger.log("Raw Options:", options);
      }

      try {
        // Validate directories before proceeding
        await validateDirectories(src, dst);

        const scanOptions: ScanOptions = {
          sourceDir: src,
          targetDir: dst,
          rulePatterns: options.rulesDir,
          excludePatterns: options.exclude,
        };

        logger.log("Starting file synchronization process...");
        const scanResult = await scan(scanOptions);

        logger.log(
          `Found ${scanResult.sourceFiles.size} files in source: ${scanOptions.sourceDir}`,
        );
        if (options.verbose) {
          scanResult.sourceFiles.forEach((file: FileInfo) => {
            logger.log(`  S: ${file.relativePath}`);
          });
        }

        logger.log(
          `Found ${scanResult.targetFiles.size} files in target: ${scanOptions.targetDir}`,
        );
        if (options.verbose) {
          scanResult.targetFiles.forEach((file: FileInfo) => {
            logger.log(`  T: ${file.relativePath}`);
          });
        }

        const mergeOptions: MergeOptions = {
          sourceDir: src,
          targetDir: dst,
          dryRun: options.dry,
        };

        const { anyConflicts } = await mergeFiles(scanResult, mergeOptions);

        // Provide summary of operations
        const totalSourceFiles = scanResult.sourceFiles.size;
        const totalTargetFiles = scanResult.targetFiles.size;

        logger.log("\n=== Synchronization Summary ===");
        logger.log(`Source files scanned: ${totalSourceFiles}`);
        logger.log(`Target files scanned: ${totalTargetFiles}`);

        if (anyConflicts) {
          logger.warn(
            "\n⚠️  Synchronization complete with conflicts detected.",
          );
          logger.warn(
            "Please review the affected files and ensure conflicts are resolved.",
          );
          logger.log("\nExiting with status 1 (conflicts detected).");
          process.exit(1);
        } else {
          logger.log("\n✅ Synchronization completed successfully!");
          logger.log(
            "All files are now synchronized between source and target.",
          );
          logger.log("\nExiting with status 0 (success).");
          process.exit(0);
        }
      } catch (processError) {
        logger.error(
          "Error during synchronization process:",
          processError instanceof Error
            ? processError.message
            : String(processError),
        );
        if (
          processError instanceof Error &&
          processError.stack &&
          options.verbose
        ) {
          logger.debug(processError.stack);
        }
        logger.error("Exiting with status 2 (error).");
        process.exit(2); // Differentiate error exit code
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander typically handles errors and exits, but catch any unexpected ones
    if (error instanceof Error) {
      logger.error(`Unexpected error: ${error.message}`);
    } else {
      logger.error("An unexpected error occurred during command parsing.");
    }
    process.exit(1);
  }
}
