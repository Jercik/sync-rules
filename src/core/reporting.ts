import type { RunFlags } from "./execution.js";
import { getLogger } from "../utils/log.js";
import type { ExecutionReport } from "./execution.js";

export type ReportOptions = Partial<RunFlags>;

export interface ProjectReport {
  projectPath: string;
  report: ExecutionReport;
  failed?: boolean;
  error?: Error;
}

/**
 * Formats a single project report
 */
function formatProjectReport(
  project: ProjectReport,
  _options: ReportOptions,
  showFilePaths: boolean,
): string[] {
  const out: string[] = [];
  const { projectPath, report, failed, error } = project;

  out.push(`Project: ${projectPath}`);

  if (failed) {
    out.push(`✗ Failed`);
  } else {
    out.push(`✓ Success`);
  }

  if (report.written.length > 0) {
    const fileCount = report.written.length;
    out.push(
      `  📝 Written: ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
    );
    // Show file paths when debug-level logging is enabled
    if (showFilePaths) {
      report.written.forEach((file) => out.push(`     - ${file}`));
    }
  }

  if (error) {
    out.push(`  ⚠️  Error:`);
    out.push(`     - ${error.message}`);
  }

  out.push(""); // Empty line between projects
  return out;
}

/**
 * Prints a formatted report for all project executions
 * @returns true if all projects succeeded, false if any failed
 */
export function printProjectReport(
  projectReports: ProjectReport[],
  options: ReportOptions = {},
): boolean {
  const logger = getLogger("core:reporting");
  const showFilePaths = logger.isLevelEnabled("debug");
  let hasErrors = false;
  const buf: string[] = [];

  buf.push("\n📋 Sync Rules Report");
  buf.push("===================\n");

  for (const project of projectReports) {
    if (project.failed) hasErrors = true;
    buf.push(...formatProjectReport(project, options, showFilePaths));
  }

  if (options.dryRun) {
    buf.push("🔍 Dry-run mode: No changes were applied");
  }

  logger.info(buf.join("\n").trimEnd());

  return !hasErrors;
}
