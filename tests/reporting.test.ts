import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printProjectReport } from "../src/reporting.ts";
import type { ProjectReport } from "../src/reporting.ts";

describe("printProjectReport", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should print basic success report", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: ["/tmp/project1/file.md"],
            copied: [],
            createdDirs: [],
          },
          errors: [],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledOnce();

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("📋 Sync Rules Report");
    expect(output).toContain("Project: /tmp/project1");
    expect(output).toContain("✓ Success");
    expect(output).toContain("📝 Written: 1 files");
  });

  it("should print failure report with errors", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: false,
          changes: {
            written: [],
            copied: [],
            createdDirs: [],
          },
          errors: [new Error("Test error"), new Error("Another error")],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledOnce();

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("✗ Failed");
    expect(output).toContain("⚠️  Errors:");
    expect(output).toContain("Test error");
    expect(output).toContain("Another error");
  });

  it("should show all change types", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: ["/tmp/file1.md", "/tmp/file2.md"],
            copied: ["/tmp/copied.md"],
            createdDirs: ["/tmp/dir1", "/tmp/dir2", "/tmp/dir3"],
          },
          errors: [],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(true);

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("📝 Written: 2 files");
    expect(output).toContain("📋 Copied: 1 files");
    expect(output).toContain("📁 Created: 3 directories");
  });

  it("should show file paths in verbose mode", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: ["/tmp/file1.md", "/tmp/file2.md"],
            copied: ["/tmp/copied.md"],
            createdDirs: ["/tmp/dir1"],
          },
          errors: [],
        },
      },
    ];

    printProjectReport(reports, { verbose: true });

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("- /tmp/file1.md");
    expect(output).toContain("- /tmp/file2.md");
    expect(output).toContain("- /tmp/copied.md");
    expect(output).toContain("- /tmp/dir1");
  });

  it("should show dry-run message when in dry-run mode", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: [],
            copied: [],
            createdDirs: [],
          },
          errors: [],
        },
      },
    ];

    printProjectReport(reports, { dryRun: true });

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("🔍 Dry-run mode: No changes were applied");
  });

  it("should handle multiple projects", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: ["/tmp/p1/file.md"],
            copied: [],
            createdDirs: [],
          },
          errors: [],
        },
      },
      {
        project: "/tmp/project2",
        report: {
          success: false,
          changes: {
            written: [],
            copied: [],
            createdDirs: [],
          },
          errors: [new Error("Failed")],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(false); // One project failed

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("Project: /tmp/project1");
    expect(output).toContain("✓ Success");
    expect(output).toContain("Project: /tmp/project2");
    expect(output).toContain("✗ Failed");
  });

  it("should handle reports with no changes", () => {
    const reports: ProjectReport[] = [
      {
        project: "/tmp/project1",
        report: {
          success: true,
          changes: {
            written: [],
            copied: [],
            createdDirs: [],
          },
          errors: [],
        },
      },
    ];

    printProjectReport(reports);

    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain("✓ Success");
    // Should not contain any of the change indicators
    expect(output).not.toContain("📝 Written:");
    expect(output).not.toContain("📋 Copied:");
    expect(output).not.toContain("📁 Created:");
  });
});
