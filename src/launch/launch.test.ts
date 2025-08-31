import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

// Provide explicit mock for adapters module
vi.mock("../adapters/adapters.ts", () => ({
  adapterFromMeta: vi.fn(),
}));

vi.mock("../adapters/registry.ts", () => ({
  adapterNames: ["claude", "gemini", "kilocode", "cline", "codex"],
}));
vi.mock("../config/config.ts");
vi.mock("../config/loader.ts");
vi.mock("../core/sync.ts");
vi.mock("../core/verification.ts");

import { launchTool } from "./launch.js";
import { spawnProcess } from "./spawn.js";
import * as configModule from "../config/config.js";
import * as configLoaderModule from "../config/loader.js";
import * as syncModule from "../core/sync.js";
import * as verificationModule from "../core/verification.js";
import type { Config, Project } from "../config/config.js";
import { SpawnError } from "../utils/errors.js";
import { execa } from "execa";

// Get mocked functions
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
      mockExeca.mockRejectedValue({
        code: "ENOENT",
        message: "spawn error",
        exitCode: 1,
      });

      await expect(spawnProcess("nonexistent", [])).rejects.toThrow(SpawnError);
      await expect(spawnProcess("nonexistent", [])).rejects.toMatchObject({
        command: "nonexistent",
        code: "ENOENT",
        exitCode: 1,
      });
    });

    it("should throw SpawnError with exit code on failure", async () => {
      mockExeca.mockRejectedValue({
        exitCode: 42,
        message: "Command failed",
      });

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

      // Store original values
      originalCwd = process.cwd;
      originalStdinIsTTY = process.stdin.isTTY;

      // Mock process.cwd
      process.cwd = vi.fn().mockReturnValue("/home/user/project");

      // Note: process.exit is no longer needed for the new API

      // Mock execa to simulate successful execution
      mockExeca.mockResolvedValue({ exitCode: 0 });

      // Mock config loader
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
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        await launchTool("claude", ["--chat"], {
          configPath: "config.json",
        });

        // Tool should be handled as a managed adapter
        expect(configModule.findProjectForPath).toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalledWith("claude", ["--chat"], {
          stdio: "inherit",
        });
      });

      it("should spawn unmanaged tools directly without verification", async () => {
        // git is not in adapterNames
        await launchTool("git", ["status"], {
          configPath: "config.json",
        });

        // Tool should be spawned directly without config checks
        expect(configModule.findProjectForPath).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalledWith("git", ["status"], {
          stdio: "inherit",
        });
      });
    });

    describe("argument passing", () => {
      it("should pass through complex arguments unchanged", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        const args = ["--chat", "--model", "opus", "--temperature", "0.7"];
        await launchTool("claude", args, {
          configPath: "config.json",
        });

        expect(mockExeca).toHaveBeenCalledWith("claude", args, {
          stdio: "inherit",
        });
      });

      it("should handle arguments with spaces correctly", async () => {
        // tool is not in adapterNames

        const args = ["--message", "hello world", "--data", '{"key": "value"}'];
        await launchTool("some-tool", args, {
          configPath: "config.json",
        });

        expect(mockExeca).toHaveBeenCalledWith("some-tool", args, {
          stdio: "inherit",
        });
      });
    });

    describe("config file handling", () => {
      it("should use loadConfig for consistent config loading", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        await launchTool("claude", [], {
          configPath: "custom-config.json",
        });

        expect(configLoaderModule.loadConfig).toHaveBeenCalledWith(
          "custom-config.json",
        );
      });

      it("should skip prompt when project not found (non-TTY)", async () => {
        process.stdin.isTTY = false;

        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(undefined);

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        // Should not prompt, just launch
        expect(mockExeca).toHaveBeenCalledWith("claude", [], {
          stdio: "inherit",
        });
      });
    });

    describe("spawning behavior", () => {
      it("should throw SpawnError when command not found", async () => {
        // Mock execa to throw ENOENT error
        mockExeca.mockRejectedValue({
          code: "ENOENT",
          message: "spawn error",
          exitCode: 1,
        });

        // tool is not in adapterNames

        await expect(
          launchTool("nonexistent", [], {
            configPath: "config.json",
          }),
        ).rejects.toThrow(SpawnError);

        await expect(
          launchTool("nonexistent", [], {
            configPath: "config.json",
          }),
        ).rejects.toMatchObject({
          code: "ENOENT",
          command: "nonexistent",
          exitCode: 1,
        });
      });

      it("should throw SpawnError with exit code from child process", async () => {
        // Mock execa to exit with code 42
        mockExeca.mockRejectedValue({
          exitCode: 42,
          message: "Command failed with exit code 42",
        });

        // tool is not in adapterNames

        await expect(
          launchTool("some-tool", [], {
            configPath: "config.json",
          }),
        ).rejects.toThrow(SpawnError);

        await expect(
          launchTool("some-tool", [], {
            configPath: "config.json",
          }),
        ).rejects.toMatchObject({
          command: "some-tool",
          exitCode: 42,
        });
      });

      it("should return 0 exit code on success", async () => {
        // Mock execa to return successful execution
        mockExeca.mockResolvedValue({ exitCode: 0 });

        // tool is not in adapterNames

        const exitCode = await launchTool("some-tool", [], {
          configPath: "config.json",
        });

        expect(exitCode).toBe(0);
      });
    });

    describe("sync behavior", () => {
      it("should skip sync when --no-sync flag is set", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);

        await launchTool("claude", [], {
          configPath: "config.json",
          noSync: true,
        });

        expect(verificationModule.verifyRules).not.toHaveBeenCalled();
        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should force sync when --force flag is set", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          project: "/home/user/project",
          report: {
            success: true,
            written: [
              "/home/user/project/CLAUDE.md",
              "/home/user/project/rules.md",
            ],
            errors: [],
          },
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
          force: true,
        });

        expect(verificationModule.verifyRules).not.toHaveBeenCalled();
        expect(syncModule.syncProject).toHaveBeenCalledWith(
          mockProject,
          expect.objectContaining({
            verbose: undefined,
            pathGuard: expect.any(Object),
          }),
        );
        expect(consoleSpy).toHaveBeenCalledWith("✓ Synced 2 files");
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should auto-sync when rules out of sync (non-TTY)", async () => {
        process.stdin.isTTY = false;

        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: false,
          issues: [{ type: "modified", path: "/project/CLAUDE.md" }],
        });
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          project: "/home/user/project",
          report: {
            success: true,
            written: [
              "/home/user/project/CLAUDE.md",
              "/home/user/project/rules.md",
            ],
            errors: [],
          },
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          "Rules out of sync (1 issue). Syncing...",
        );
        expect(syncModule.syncProject).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith("✓ Synced 2 files");
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should show verbose output when verbose flag is set", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: false,
          issues: [
            { type: "modified", path: "/project/CLAUDE.md" },
            { type: "missing", path: "/project/GEMINI.md" },
          ],
        });

        const consoleSpy = vi.spyOn(console, "log");

        process.stdin.isTTY = false; // Skip prompt

        await launchTool("claude", [], {
          configPath: "config.json",
          verbose: true,
        });

        expect(consoleSpy).toHaveBeenCalledWith("Rules are out of sync:");
        expect(consoleSpy).toHaveBeenCalledWith(
          "  - modified: /project/CLAUDE.md",
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          "  - missing: /project/GEMINI.md",
        );
      });

      it("should handle rules already up to date", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
          verbose: true,
        });

        expect(consoleSpy).toHaveBeenCalledWith("✓ Rules up to date");
        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should not log when rules up to date and not verbose", async () => {
        // claude is in adapterNames
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        // Should not have any console output when already synced
        expect(consoleSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("Rules up to date"),
        );
        expect(mockExeca).toHaveBeenCalled();
      });
    });
  });
});
