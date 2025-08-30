import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "../src/cli.ts";
import { Config } from "../src/config/config.ts";
import { ConfigParseError } from "../src/utils/errors.ts";
import type { WriteAction } from "../src/utils/content.ts";

// Mock the modules with vi.hoisted
const {
  mockReadFile,
  mockAdapters,
  mockGlobRulePaths,
  mockFilterValidMdPaths,
  mockReadRuleContents,
  mockExecuteActions,
  mockPrintProjectReport,
  mockLoadConfig,
} = vi.hoisted(() => {
  const mockAdapterFunction = vi.fn();
  return {
    mockReadFile: vi.fn(),
    mockAdapters: {
      claude: mockAdapterFunction,
      gemini: mockAdapterFunction,
      kilocode: mockAdapterFunction,
      cline: mockAdapterFunction,
      codex: mockAdapterFunction,
    },
    mockGlobRulePaths: vi.fn(),
    mockFilterValidMdPaths: vi.fn(),
    mockReadRuleContents: vi.fn(),
    mockExecuteActions: vi.fn(),
    mockPrintProjectReport: vi.fn(),
    mockLoadConfig: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

vi.mock("../src/adapters/adapters.ts", () => ({
  adapters: mockAdapters,
}));

vi.mock("../src/core/filesystem.ts", () => ({
  globRulePaths: mockGlobRulePaths,
  filterValidMdPaths: mockFilterValidMdPaths,
  readRuleContents: mockReadRuleContents,
}));

vi.mock("../src/core/execution.ts", () => ({
  executeActions: mockExecuteActions,
}));

vi.mock("../src/core/reporting.ts", () => ({
  printProjectReport: mockPrintProjectReport,
}));

vi.mock("../src/config/config-loader.ts", () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock("../src/core/path-guard.ts", () => ({
  createPathGuardFromConfig: vi.fn(() => ({
    validatePath: vi.fn((path) => path),
    getAllowedRoots: vi.fn(() => []),
    isInsideAllowedRoot: vi.fn(() => true),
  })),
}));

// Create a mock that can be controlled per test
const mockSyncProject = vi.fn();

vi.mock("../src/core/sync.ts", () => ({
  syncProject: mockSyncProject,
}));

describe("CLI", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    // Setup default mock implementations
    const defaultConfig = {
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };
    mockLoadConfig.mockResolvedValue(defaultConfig);

    // Default syncProject mock
    mockSyncProject.mockResolvedValue({
      projectPath: "~/test-project",
      report: {
        success: true,
        changes: {
          written: ["~/test-project/file.md"],
        },
        errors: [],
      },
    });

    // Mock all adapters to return the same function
    Object.values(mockAdapters).forEach((mockAdapter) => {
      mockAdapter.mockImplementation(() => {
        return [
          {
            path: "~/test-project/file.md",
            content: "test content",
          },
        ] as WriteAction[];
      });
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
    mockLoadConfig.mockResolvedValue(mockConfig);

    await main(["node", "sync-rules", "-c", "~/test-config.json", "sync"]);

    // Check that printProjectReport was called with correct data
    expect(mockPrintProjectReport).toHaveBeenCalledWith(
      [
        {
          projectPath: expect.stringContaining("test-project"),
          report: {
            success: true,
            changes: {
              written: ["~/test-project/file.md"],
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

    mockLoadConfig.mockResolvedValue(mockConfig);

    await main([
      "node",
      "sync-rules",
      "-c",
      "~/test-config.json",
      "-d",
      "sync",
    ]);

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

    mockLoadConfig.mockResolvedValue(mockConfig);

    // Mock syncProject to return an error
    mockSyncProject.mockResolvedValueOnce({
      projectPath: "~/test-project",
      report: {
        success: false,
        changes: {
          written: [],
        },
        errors: [new Error("Test error")],
      },
    });

    // Mock printProjectReport to return false (indicating failure)
    mockPrintProjectReport.mockReturnValueOnce(false);

    await expect(
      main(["node", "sync-rules", "-c", "~/test-config.json", "sync"]),
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

    mockLoadConfig.mockResolvedValue(mockConfig);

    await main([
      "node",
      "sync-rules",
      "-c",
      "~/test-config.json",
      "--verbose",
      "sync",
    ]);

    // Check that verbose option was passed to printProjectReport
    expect(mockPrintProjectReport).toHaveBeenCalledWith(expect.any(Array), {
      verbose: true,
      dryRun: false,
    });
  });

  it("should handle invalid config file", async () => {
    const parseError = new ConfigParseError(
      "~/test-config.json",
      new Error("Invalid JSON"),
    );
    mockLoadConfig.mockRejectedValue(parseError);

    await expect(
      main(["node", "sync-rules", "-c", "~/test-config.json", "sync"]),
    ).rejects.toThrow("Process exited with code 1");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load config"),
      expect.stringContaining("Invalid JSON"),
    );
  });
});
