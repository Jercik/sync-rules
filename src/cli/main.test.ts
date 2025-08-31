import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "./main.js";
import { Config } from "../config/config.js";
import { ConfigParseError } from "../utils/errors.js";

// Mock the modules with vi.hoisted
const { mockReadFile, mockPrintProjectReport, mockLoadConfig } = vi.hoisted(
  () => {
    return {
      mockReadFile: vi.fn(),
      mockPrintProjectReport: vi.fn(),
      mockLoadConfig: vi.fn(),
    };
  },
);

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

vi.mock("../core/reporting.ts", () => ({
  printProjectReport: mockPrintProjectReport,
}));

vi.mock("../config/loader.ts", () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock("../core/path-guard.ts", () => ({
  createPathGuardFromConfig: vi.fn(() => ({
    validatePath: vi.fn((path) => path),
    getAllowedRoots: vi.fn(() => []),
    isInsideAllowedRoot: vi.fn(() => true),
  })),
}));

// Create a mock that can be controlled per test
const mockSyncProject = vi.fn();

vi.mock("../core/sync.ts", () => ({
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
        written: ["~/test-project/file.md"],
        errors: [],
      },
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
            written: ["~/test-project/file.md"],
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
        written: [],
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
      expect.stringContaining(
        "✗ Error: Failed to load config from ~/test-config.json: Invalid JSON",
      ),
    );
  });
});
