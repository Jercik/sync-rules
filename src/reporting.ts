import type { ExecutionReport } from "./execution.ts";
import chalk from "chalk";

export interface ProjectReport {
  project: string;
  report: ExecutionReport;
}

export interface ReportOptions {
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Prints a formatted report for all project executions
 * @returns true if all projects succeeded, false if any failed
 */
export function printProjectReport(
  projectReports: ProjectReport[],
  options: ReportOptions = {},
): boolean {
  let hasErrors = false;
  const lines: string[] = [];

  // Header
  lines.push("\n📋 Sync Rules Report");
  lines.push("===================\n");

  // Project reports
  for (const { project, report } of projectReports) {
    lines.push(chalk.bold(`Project: ${project}`));

    if (report.success) {
      lines.push(`${chalk.green("✓")} Success`);
    } else {
      lines.push(`${chalk.red("✗")} Failed`);
      hasErrors = true;
    }

    // Print changes
    if (report.changes.written.length > 0) {
      lines.push(`  📝 Written: ${report.changes.written.length} files`);
      if (options.verbose) {
        report.changes.written.forEach((file) => lines.push(`     - ${file}`));
      }
    }

    if (report.changes.copied.length > 0) {
      lines.push(`  📋 Copied: ${report.changes.copied.length} files`);
      if (options.verbose) {
        report.changes.copied.forEach((file) => lines.push(`     - ${file}`));
      }
    }

    if (report.changes.createdDirs.length > 0) {
      lines.push(
        `  📁 Created: ${report.changes.createdDirs.length} directories`,
      );
      if (options.verbose) {
        report.changes.createdDirs.forEach((dir) =>
          lines.push(`     - ${dir}`),
        );
      }
    }

    // Print errors
    if (report.errors && report.errors.length > 0) {
      lines.push(`  ${chalk.red("⚠️  Errors:")}`);
      report.errors.forEach((error) => lines.push(`     - ${error.message}`));
    }

    lines.push(""); // Empty line between projects
  }

  // Summary
  if (options.dryRun) {
    lines.push(chalk.yellow("🔍 Dry-run mode: No changes were applied"));
  }

  // Print all lines at once
  console.log(lines.join("\n"));

  return !hasErrors;
}
