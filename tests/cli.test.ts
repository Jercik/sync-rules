import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "../src/cli.ts";
import { Config } from "../src/config.ts";
import type { FSAction } from "../src/utils.ts";

// Mock the modules with vi.hoisted
const {
  mockReadFile,
  mockGetAdapter,
  mockGlobRulePaths,
  mockFilterValidMdPaths,
  mockReadRuleContents,
  mockExecuteActions,
  mockPrintProjectReport,
} = vi.hoisted(() => {
  return {
    mockReadFile: vi.fn(),
    mockGetAdapter: vi.fn(),
    mockGlobRulePaths: vi.fn(),
    mockFilterValidMdPaths: vi.fn(),
    mockReadRuleContents: vi.fn(),
    mockExecuteActions: vi.fn(),
    mockPrintProjectReport: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

vi.mock("../src/adapters/index.ts", () => ({
  getAdapter: mockGetAdapter,
}));

vi.mock("../src/filesystem.ts", () => ({
  globRulePaths: mockGlobRulePaths,
  filterValidMdPaths: mockFilterValidMdPaths,
  readRuleContents: mockReadRuleContents,
}));

vi.mock("../src/execution.ts", () => ({
  executeActions: mockExecuteActions,
}));

vi.mock("../src/reporting.ts", () => ({
  printProjectReport: mockPrintProjectReport,
}));

describe("CLI", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    // Setup default mock implementations
    mockGetAdapter.mockImplementation(() => {
      return () => {
        return [
          {
            type: "write",
            path: "~/test-project/file.md",
            content: "test content",
          },
        ] as FSAction[];
      };
    });

    mockGlobRulePaths.mockResolvedValue(["rule1.md", "rule2.md"]);
    mockFilterValidMdPaths.mockResolvedValue(["rule1.md", "rule2.md"]);
    mockReadRuleContents.mockResolvedValue([
      { path: "rule1.md", content: "# Rule 1" },
      { path: "rule2.md", content: "# Rule 2" },
    ]);

    mockExecuteActions.mockResolvedValue({
      success: true,
      changes: {
        written: ["~/test-project/file.md"],
        copied: [],
        createdDirs: [],
      },
      errors: [],
    });

    // Default mock for printProjectReport
    mockPrintProjectReport.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should process config and execute actions successfully", async () => {
    const mockConfig: Config = {
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

    await main(["node", "sync-rules", "-c", "~/test-config.json"]);

    // Check that printProjectReport was called with correct data
    expect(mockPrintProjectReport).toHaveBeenCalledWith(
      [
        {
          project: expect.stringContaining("test-project"),
          report: {
            success: true,
            changes: {
              written: ["~/test-project/file.md"],
              copied: [],
              createdDirs: [],
            },
            errors: [],
          },
        },
      ],
      { verbose: false, dryRun: false },
    );
  });

  it("should handle dry-run mode", async () => {
    const mockConfig: Config = {
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

    await main(["node", "sync-rules", "-c", "~/test-config.json", "-d"]);

    expect(mockPrintProjectReport).toHaveBeenCalledWith(expect.any(Array), {
      verbose: false,
      dryRun: true,
    });
  });

  it("should handle errors and exit with code 1", async () => {
    const mockConfig: Config = {
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

    // Mock executeActions to return an error
    mockExecuteActions.mockResolvedValueOnce({
      success: false,
      changes: {
        written: [],
        copied: [],
        createdDirs: [],
      },
      errors: [new Error("Test error")],
    });

    // Mock printProjectReport to return false (indicating failure)
    mockPrintProjectReport.mockReturnValueOnce(false);

    await expect(
      main(["node", "sync-rules", "-c", "~/test-config.json"]),
    ).rejects.toThrow("Process exited with code 1");

    expect(mockPrintProjectReport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          report: expect.objectContaining({
            success: false,
            errors: [expect.any(Error)],
          }),
        }),
      ]),
      expect.any(Object),
    );
  });

  it("should handle verbose mode", async () => {
    const mockConfig: Config = {
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

    await main(["node", "sync-rules", "-c", "~/test-config.json", "--verbose"]);

    // Check that verbose option was passed to printProjectReport
    expect(mockPrintProjectReport).toHaveBeenCalledWith(expect.any(Array), {
      verbose: true,
      dryRun: false,
    });
  });

  it("should handle invalid config file", async () => {
    mockReadFile.mockResolvedValue("invalid json");

    await expect(
      main(["node", "sync-rules", "-c", "~/test-config.json"]),
    ).rejects.toThrow("Process exited with code 1");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid JSON"),
    );
  });
});
