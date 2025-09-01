import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "./main.js";
import { Config } from "../config/config.js";
import { ConfigParseError } from "../utils/errors.js";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";

vi.mock("../utils/log.js", () => {
  const child = {
    debug: vi.fn(),
    info: vi.fn(),
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
    getLogFilePath: vi.fn(() => "/tmp/debug.log"),
  };
});

const {
  mockReadFile,
  mockAccess,
  mockPrintProjectReport,
  mockLoadConfig,
  mockCreateSampleConfig,
} = vi.hoisted(() => {
  return {
    mockReadFile: vi.fn(),
    mockAccess: vi.fn(),
    mockPrintProjectReport: vi.fn(),
    mockLoadConfig: vi.fn(),
    mockCreateSampleConfig: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
  access: mockAccess,
  constants: {
    F_OK: 0,
  },
}));

vi.mock("../core/reporting.js", () => ({
  printProjectReport: mockPrintProjectReport,
}));

vi.mock("../config/loader.js", () => ({
  loadConfig: mockLoadConfig,
  createSampleConfig: mockCreateSampleConfig,
}));

const mockSyncProject = vi.fn();

vi.mock("../core/sync.js", () => ({
  syncProject: mockSyncProject,
}));

describe("CLI", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // process.exit is not used by main() anymore; no spy needed.

    const defaultConfig = {
      rulesSource: "/path/to/rules",
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };
    mockLoadConfig.mockResolvedValue(defaultConfig);

    mockSyncProject.mockResolvedValue({
      projectPath: "~/test-project",
      report: {
        written: ["~/test-project/file.md"],
      },
    });

    mockPrintProjectReport.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should process config and execute actions successfully", async () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
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

    expect(mockPrintProjectReport).toHaveBeenCalledWith(
      [
        {
          projectPath: expect.stringContaining("test-project"),
          report: {
            written: ["~/test-project/file.md"],
          },
        },
      ],
      { dryRun: false },
    );
  });

  it("should handle dry-run mode", async () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
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
      dryRun: true,
    });
  });

  it("should handle errors and exit with code 1", async () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
      projects: [
        {
          path: "~/test-project",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
      ],
    };

    mockLoadConfig.mockResolvedValue(mockConfig);

    mockSyncProject.mockRejectedValueOnce(new Error("Test error"));

    mockPrintProjectReport.mockReturnValueOnce(false); // indicating failure

    const code = await main([
      "node",
      "sync-rules",
      "-c",
      "~/test-config.json",
      "sync",
    ]);
    expect(code).toBe(1);

    expect(mockPrintProjectReport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          failed: true,
          error: expect.any(Error),
        }),
      ]),
      expect.any(Object),
    );
  });

  it("should log file path when log level is debug", async () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
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
      "--log-level",
      "debug",
      "sync",
    ]);

    // Ensure it announced the log file path at debug level
    const { getLogger } = await import("../utils/log.js");
    const cliLogger = getLogger("cli");
    expect(cliLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("log file: /tmp/debug.log"),
    );
  });

  it("should handle invalid config file", async () => {
    const parseError = new ConfigParseError(
      "~/test-config.json",
      new Error("Invalid JSON"),
    );
    mockLoadConfig.mockRejectedValue(parseError);

    const { rootLogger: logger } = await import("../utils/log.js");

    const code = await main([
      "node",
      "sync-rules",
      "-c",
      "~/test-config.json",
      "sync",
    ]);
    expect(code).toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Error: Failed to load config from ~/test-config.json: Invalid JSON",
      ),
    );
  });

  describe("init command", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("should create a new config file when none exists", async () => {
      mockAccess.mockRejectedValue(new Error("File not found"));
      mockCreateSampleConfig.mockResolvedValue(undefined);

      await main(["node", "sync-rules", "init"]);

      expect(mockAccess).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH, 0);
      expect(mockCreateSampleConfig).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH);
    });

    it("should not overwrite existing config without --force", async () => {
      mockAccess.mockResolvedValue(undefined);

      const code = await main(["node", "sync-rules", "init"]);
      expect(code).toBe(1);

      expect(mockAccess).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH, 0);
      expect(mockCreateSampleConfig).not.toHaveBeenCalled();
    });

    it("should overwrite existing config with --force", async () => {
      mockAccess.mockResolvedValue(undefined);
      mockCreateSampleConfig.mockResolvedValue(undefined);

      await main(["node", "sync-rules", "init", "--force"]);

      expect(mockAccess).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH, 0);
      expect(mockCreateSampleConfig).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH);
    });

    it("should handle existing invalid config files safely", async () => {
      // This test ensures that even if a config file exists but is invalid JSON,
      // we still protect it from being overwritten without --force
      mockAccess.mockResolvedValue(undefined);

      const code = await main(["node", "sync-rules", "init"]);
      expect(code).toBe(1);

      // Should NOT attempt to load/parse the config
      expect(mockLoadConfig).not.toHaveBeenCalled();
      // Should NOT overwrite the file
      expect(mockCreateSampleConfig).not.toHaveBeenCalled();
    });

    it("should use custom config path from -c option", async () => {
      mockAccess.mockRejectedValue(new Error("File not found"));
      mockCreateSampleConfig.mockResolvedValue(undefined);

      await main(["node", "sync-rules", "-c", "custom.json", "init"]);

      expect(mockAccess).toHaveBeenCalledWith("custom.json", 0);
      expect(mockCreateSampleConfig).toHaveBeenCalledWith("custom.json");
    });
  });
});
