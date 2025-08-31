import type { ExecutionReport } from "./execution.js";
import chalk from "chalk";

export interface ProjectReport {
  projectPath: string;
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
  for (const { projectPath, report } of projectReports) {
    lines.push(chalk.bold(`Project: ${projectPath}`));

    if (report.success) {
      lines.push(`${chalk.green("✓")} Success`);
    } else {
      lines.push(`${chalk.red("✗")} Failed`);
      hasErrors = true;
    }

    // Print changes
    if (report.written.length > 0) {
      const fileCount = report.written.length;
      lines.push(
        `  📝 Written: ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
      );
      if (options.verbose) {
        report.written.forEach((file) => lines.push(`     - ${file}`));
      }
    }

    // Only 'write' changes are reported

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
  console.log(lines.join("\n").trimEnd());

  return !hasErrors;
}
