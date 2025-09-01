import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printProjectReport } from "./reporting.js";
import type { ProjectReport } from "./reporting.js";
import { rootLogger as logger } from "../utils/log.js";

vi.mock("../utils/log.js", () => {
  const child = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: "info",
    isLevelEnabled: (lvl: string) => {
      const order: Record<string, number> = {
        trace: 10,
        debug: 20,
        info: 30,
        warn: 40,
        error: 50,
        fatal: 60,
        silent: Infinity,
      };
      const current = order[(child as any).level] ?? 30;
      const target = order[lvl] ?? 30;
      return current <= target;
    },
  };
  return {
    getLogger: vi.fn(() => child),
    rootLogger: child,
  };
});

describe("printProjectReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should print basic success report", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: ["/tmp/project1/file.md"],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(true);
    expect(logger.info).toHaveBeenCalled();

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("📋 Sync Rules Report");
    expect(output).toContain("Project: /tmp/project1");
    expect(output).toContain("✓ Success");
    expect(output).toContain("📝 Written: 1 file");
  });

  it("should print failure report with errors", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: [],
        },
        failed: true,
        error: new Error("Test error"),
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(false);
    expect(logger.info).toHaveBeenCalled();

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("✗ Failed");
    expect(output).toContain("⚠️  Error:");
    expect(output).toContain("Test error");
  });

  it("should show written change type only", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: ["/tmp/file1.md", "/tmp/file2.md"],
        },
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(true);

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("📝 Written: 2 files");
  });

  it("should show file paths in debug mode", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: ["/tmp/file1.md", "/tmp/file2.md"],
        },
      },
    ];

    // Set debug log level on the mocked logger
    (logger as any).level = "debug";
    printProjectReport(reports);

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("- /tmp/file1.md");
    // Clean up
    (logger as any).level = "info";
    expect(output).toContain("- /tmp/file2.md");
  });

  it("should show dry-run message when in dry-run mode", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: [],
        },
      },
    ];

    printProjectReport(reports, { dryRun: true });

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("🔍 Dry-run mode: No changes were applied");
  });

  it("should handle multiple projects", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: ["/tmp/p1/file.md"],
        },
      },
      {
        projectPath: "/tmp/project2",
        report: {
          written: [],
        },
        failed: true,
        error: new Error("Failed"),
      },
    ];

    const result = printProjectReport(reports);

    expect(result).toBe(false); // One project failed

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("Project: /tmp/project1");
    expect(output).toContain("✓ Success");
    expect(output).toContain("Project: /tmp/project2");
    expect(output).toContain("✗ Failed");
  });

  it("should handle reports with no changes", () => {
    const reports: ProjectReport[] = [
      {
        projectPath: "/tmp/project1",
        report: {
          written: [],
        },
      },
    ];

    printProjectReport(reports);

    const output = (logger.info as any).mock.calls[0][0];
    expect(output).toContain("✓ Success");
    // Should not contain change indicator when no files written
    expect(output).not.toContain("📝 Written:");
  });
});
