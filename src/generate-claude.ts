import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import * as logger from "./utils/core.ts";
import { generateEffectiveMdPatterns, filterMdFiles } from "./utils/core.ts";
import type { MultiSyncOptions } from "./multi-sync.ts";

/**
 * Generates a CLAUDE.md file by concatenating all .md rule files from the project.
 * Uses minimal concatenation: just trim + \n\n between files, relying on file-internal headers.
 *
 * @param projectDir The project directory to scan for rule files
 * @param options MultiSync options containing rule patterns and exclude patterns
 * @returns The concatenated content for CLAUDE.md
 */
export async function generateClaudeMd(
  projectDir: string,
  options: MultiSyncOptions,
): Promise<string> {
  let concatenated = "# CLAUDE.md - Rules for Claude Code\n\n";

  // Find all rule files using fast-glob
  // Global .md constraint: ensure all patterns only match .md files
  const effectivePatterns = await generateEffectiveMdPatterns(options.rulePatterns, projectDir);

  let allFiles: string[];
  try {
    allFiles = await fg(effectivePatterns, {
      cwd: projectDir,
      dot: true,
      onlyFiles: true,
      absolute: true,
      ignore: options.excludePatterns,
      suppressErrors: true, // Ignore ENOTDIR errors
    });
  } catch (globErr) {
    // If fast-glob fails entirely (e.g., permission denied on directory), return minimal content
    logger.warn(`Unable to scan ${projectDir}: ${globErr instanceof Error ? globErr.message : String(globErr)}`);
    return concatenated + "*[Unable to scan project directory due to permission errors]*\n\n";
  }

  // Apply post-processing filter to ensure only .md files are processed
  const files = filterMdFiles(allFiles);
  
  if (allFiles.length > files.length) {
    const nonMdCount = allFiles.length - files.length;
    logger.debug(`Filtered out ${nonMdCount} non-.md file(s) from glob results`);
  }

  // Sort files for consistent order
  files.sort();

  // Minimal concatenation: just trim + \n\n; relies on file-internal headers
  for (const filePath of files) {
    const relPath = path.relative(projectDir, filePath);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      concatenated += content.trim() + "\n\n";
    } catch (err) {
      logger.warn(`Skipping unreadable file: ${relPath}`);
      concatenated += "*[File content could not be read]*\n\n";
    }
  }

  return concatenated;
}
