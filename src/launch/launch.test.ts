import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("execa", () => {
  class ExecaError extends Error {
    code?: string;
    exitCode?: number | null;
    stderr?: string;
    constructor(message: string, opts: { code?: string; exitCode?: number | null; stderr?: string } = {}) {
      super(message);
      this.name = "ExecaError";
      this.code = opts.code;
      this.exitCode = opts.exitCode;
      this.stderr = opts.stderr;
    }
  }
  return {
    execa: vi.fn(),
    ExecaError,
  };
});

// Provide explicit mock for adapters module
vi.mock("../adapters/adapters.ts", () => ({
  createAdapter: vi.fn(),
}));

vi.mock("../adapters/registry.ts", () => ({
  adapterNames: ["claude", "gemini", "kilocode", "cline", "codex"],
}));
vi.mock("../config/config.ts");
vi.mock("../config/loader.ts");
vi.mock("../core/sync.ts");

import { launchTool } from "./launch.js";
import { spawnProcess } from "./spawn.js";
import * as configModule from "../config/config.js";
import * as configLoaderModule from "../config/loader.js";
import * as syncModule from "../core/sync.js";
import type { Config, Project } from "../config/config.js";
import {
  SpawnError,
  ProjectNotFoundError,
  AdapterNotConfiguredError,
} from "../utils/errors.js";
import { execa, ExecaError } from "execa";

const mockExeca = vi.mocked(execa);

describe("launch", () => {
  describe("spawnProcess", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return exit code 0 on successful execution", async () => {
      mockExeca.mockResolvedValue({ exitCode: 0 });

      const exitCode = await spawnProcess("echo", ["hello"]);

      expect(exitCode).toBe(0);
      expect(mockExeca).toHaveBeenCalledWith("echo", ["hello"], {
        stdio: "inherit",
      });
    });

    it("should throw SpawnError when command not found", async () => {
      mockExeca.mockRejectedValue(
        new ExecaError("spawn error", { code: "ENOENT", exitCode: 1 }),
      );

      await expect(spawnProcess("nonexistent", [])).rejects.toThrow(SpawnError);
      await expect(spawnProcess("nonexistent", [])).rejects.toMatchObject({
        command: "nonexistent",
        code: "ENOENT",
        exitCode: 1,
      });
    });

    it("should throw SpawnError with exit code on failure", async () => {
      mockExeca.mockRejectedValue(
        new ExecaError("Command failed", { exitCode: 42 }),
      );

      await expect(spawnProcess("failing-cmd", ["arg"])).rejects.toThrow(
        SpawnError,
      );
      await expect(spawnProcess("failing-cmd", ["arg"])).rejects.toMatchObject({
        command: "failing-cmd",
        exitCode: 42,
      });
    });

    it("should handle null exit code as 0", async () => {
      mockExeca.mockResolvedValue({ exitCode: null });

      const exitCode = await spawnProcess("cmd", []);

      expect(exitCode).toBe(0);
    });
  });

  describe("launchTool", () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
      projects: [
        {
          path: "/home/user/project",
          rules: ["**/*.md"],
          adapters: ["claude", "gemini"],
        },
      ],
    };

    const mockProject: Project = mockConfig.projects[0];

    let originalCwd: () => string;
    let originalStdinIsTTY: boolean | undefined;

    beforeEach(() => {
      vi.clearAllMocks();

      originalCwd = process.cwd;
      originalStdinIsTTY = process.stdin.isTTY;

      process.cwd = vi.fn().mockReturnValue("/home/user/project");

      // Note: process.exit is no longer needed for the new API

      mockExeca.mockResolvedValue({ exitCode: 0 });

      vi.mocked(configLoaderModule.loadConfig).mockResolvedValue(mockConfig);

      // adapterNames is already mocked in the module mock
    });

    afterEach(() => {
      process.cwd = originalCwd;
      process.stdin.isTTY = originalStdinIsTTY as boolean;
    });

    describe("tool detection", () => {
      it("should detect managed tools using adapter registry", async () => {
        // claude is in the mocked adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        await launchTool(
          "claude",
          ["--chat"],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        // Tool should be handled as a managed adapter
        expect(configModule.findProjectForPath).toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalledWith("claude", ["--chat"], {
          stdio: "inherit",
        });
      });

      it("should spawn unmanaged tools directly without sync", async () => {
        // git is not in adapterNames
        const result = await launchTool(
          "git",
          ["status"],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        // Tool should be spawned directly without config checks
        expect(configModule.findProjectForPath).not.toHaveBeenCalled();
        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalledWith("git", ["status"], {
          stdio: "inherit",
        });
        expect(result.projectReport.report.written).toEqual([]);
        expect(result.exitCode).toBe(0);
      });
    });

    describe("argument passing", () => {
      it("should pass through complex arguments unchanged", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        const args = ["--chat", "--model", "opus", "--temperature", "0.7"];
        await launchTool(
          "claude",
          args,
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(mockExeca).toHaveBeenCalledWith("claude", args, {
          stdio: "inherit",
        });
      });

      it("should handle arguments with spaces correctly", async () => {
        // tool is not in adapterNames

        const args = ["--message", "hello world", "--data", '{"key": "value"}'];
        await launchTool(
          "some-tool",
          args,
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(mockExeca).toHaveBeenCalledWith("some-tool", args, {
          stdio: "inherit",
        });
      });
    });

    describe("config file handling", () => {
      it("should use loadConfig for consistent config loading", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        await launchTool(
          "claude",
          [],
          {
            configPath: "custom-config.json",
          },
          { dryRun: false },
        );

        expect(configLoaderModule.loadConfig).toHaveBeenCalledWith(
          "custom-config.json",
        );
      });

      it("should throw ProjectNotFoundError when project not found for managed adapter", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(undefined);

        await expect(
          launchTool(
            "claude",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toBeInstanceOf(ProjectNotFoundError);
      });

      it("should throw AdapterNotConfiguredError when adapter not configured for project", async () => {
        const projectWithoutClaude = {
          ...mockProject,
          adapters: ["gemini"], // claude not included
        };

        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(
          projectWithoutClaude,
        );

        await expect(
          launchTool(
            "claude",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toBeInstanceOf(AdapterNotConfiguredError);
      });
    });

    describe("spawning behavior", () => {
      it("should throw SpawnError when command not found", async () => {
        mockExeca.mockRejectedValue(
          new ExecaError("spawn error", { code: "ENOENT", exitCode: 1 }),
        );

        // tool is not in adapterNames

        await expect(
          launchTool(
            "nonexistent",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toThrow(SpawnError);

        await expect(
          launchTool(
            "nonexistent",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toMatchObject({
          code: "ENOENT",
          command: "nonexistent",
          exitCode: 1,
        });
      });

      it("should throw SpawnError with exit code from child process", async () => {
        mockExeca.mockRejectedValue(
          new ExecaError("Command failed with exit code 42", { exitCode: 42 }),
        );

        // tool is not in adapterNames

        await expect(
          launchTool(
            "some-tool",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toThrow(SpawnError);

        await expect(
          launchTool(
            "some-tool",
            [],
            {
              configPath: "config.json",
            },
            { dryRun: false },
          ),
        ).rejects.toMatchObject({
          command: "some-tool",
          exitCode: 42,
        });
      });

      it("should return 0 exit code on success", async () => {
        mockExeca.mockResolvedValue({ exitCode: 0 });

        // tool is not in adapterNames

        const result = await launchTool(
          "some-tool",
          [],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(result.exitCode).toBe(0);
        expect(result.projectReport).toBeDefined();
        expect(result.projectReport.report.written).toEqual([]);
      });
    });

    describe("sync behavior", () => {
      it("should skip sync when --no-sync flag is set", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);

        const result = await launchTool(
          "claude",
          [],
          {
            configPath: "config.json",
            noSync: true,
          },
          { dryRun: false },
        );

        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
        expect(result.projectReport.report.written).toEqual([]);
      });

      it("should always sync by default", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [
              "/home/user/project/CLAUDE.md",
              "/home/user/project/rules.md",
            ],
          },
        });

        const result = await launchTool(
          "claude",
          [],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(syncModule.syncProject).toHaveBeenCalledWith(
          mockProject,
          { dryRun: false },
          expect.objectContaining({ rulesSource: expect.any(String) }),
        );
        expect(result.projectReport.report.written).toHaveLength(2);
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should sync and report files written", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [
              "/home/user/project/CLAUDE.md",
              "/home/user/project/rules.md",
            ],
          },
        });

        const result = await launchTool(
          "claude",
          [],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(syncModule.syncProject).toHaveBeenCalled();
        expect(result.projectReport.report.written).toEqual([
          "/home/user/project/CLAUDE.md",
          "/home/user/project/rules.md",
        ]);
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should show verbose output when verbose flag is set and no files need syncing", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        const result = await launchTool(
          "claude",
          [],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        expect(result.projectReport.report.written).toEqual([]);
        expect(syncModule.syncProject).toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should not log when no files need syncing and not verbose", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool(
          "claude",
          [],
          {
            configPath: "config.json",
          },
          { dryRun: false },
        );

        // Should not have any console output when no files written
        expect(consoleSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("Rules up to date"),
        );
        expect(consoleSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("Synced"),
        );
        expect(syncModule.syncProject).toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
      });
    });
  });
});
