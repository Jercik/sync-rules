import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

// Mock prompts module for tests requiring interactive prompts
vi.mock("prompts", () => ({
  default: vi.fn(),
}));

// Provide explicit mock for adapters module
vi.mock("../src/adapters/adapters.ts", () => ({
  adapters: {
    claude: vi.fn(),
    gemini: vi.fn(),
    kilocode: vi.fn(),
    cline: vi.fn(),
    codex: vi.fn(),
  },
}));
vi.mock("../src/config/config.ts");
vi.mock("../src/config/config-loader.ts");
vi.mock("../src/core/sync.ts");
vi.mock("../src/core/verification.ts");

import { launchTool } from "../src/launch/launch.ts";
import { spawnProcess } from "../src/launch/process.ts";
import * as adaptersModule from "../src/adapters/adapters.ts";
import * as configModule from "../src/config/config.ts";
import * as configLoaderModule from "../src/config/config-loader.ts";
import * as syncModule from "../src/core/sync.ts";
import * as verificationModule from "../src/core/verification.ts";
import type { Config, Project } from "../src/config/config.ts";
import { SpawnError } from "../src/utils/errors.ts";
import { execa } from "execa";
import prompts from "prompts";

// Get mocked functions
const mockExeca = vi.mocked(execa);
const mockPrompts = vi.mocked(prompts);

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
        reject: true,
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

      // Reset prompts mock
      mockPrompts.mockReset();

      // Mock execa to simulate successful execution
      mockExeca.mockResolvedValue({ exitCode: 0 });

      // Mock config loader
      vi.mocked(configLoaderModule.loadConfig).mockResolvedValue(mockConfig);

      // adapters object is already mocked in the module mock
    });

    afterEach(() => {
      process.cwd = originalCwd;
      process.stdin.isTTY = originalStdinIsTTY as boolean;
    });

    describe("tool detection", () => {
      it("should detect managed tools using adapter registry", async () => {
        // claude is already in adapters object from the mock
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        await launchTool("claude", ["--chat"], {
          configPath: "config.json",
        });

        expect(Object.keys(adaptersModule.adapters)).toContain("claude");
        expect(mockExeca).toHaveBeenCalledWith("claude", ["--chat"], {
          stdio: "inherit",
          reject: true,
        });
      });

      it("should spawn unmanaged tools directly without verification", async () => {
        // git is not in adapters object

        await launchTool("git", ["status"], {
          configPath: "config.json",
        });

        expect(Object.keys(adaptersModule.adapters)).not.toContain("git");
        expect(configModule.findProjectForPath).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalledWith("git", ["status"], {
          stdio: "inherit",
          reject: true,
        });
      });
    });

    describe("argument passing", () => {
      it("should pass through complex arguments unchanged", async () => {
        // claude is in adapters object
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
          reject: true,
        });
      });

      it("should handle arguments with spaces correctly", async () => {
        // tool is not in ADAPTER_NAMES

        const args = ["--message", "hello world", "--data", '{"key": "value"}'];
        await launchTool("some-tool", args, {
          configPath: "config.json",
        });

        expect(mockExeca).toHaveBeenCalledWith("some-tool", args, {
          stdio: "inherit",
          reject: true,
        });
      });
    });

    describe("config file handling", () => {
      it("should use loadConfig for consistent config loading", async () => {
        // claude is in adapters object
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

      it("should prompt to edit config when project not found (TTY)", async () => {
        process.stdin.isTTY = true;

        // Use the globally mocked readline interface
        mockPrompts.mockResolvedValue({ value: false });

        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(undefined);

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        expect(mockPrompts).toHaveBeenCalledWith({
          type: "confirm",
          name: "value",
          message: "Would you like to open the config file to add it? [Y/n]",
          initial: true,
        });
        expect(mockExeca).toHaveBeenCalledWith("claude", [], {
          stdio: "inherit",
          reject: true,
        });
      });

      it("should skip prompt when project not found (non-TTY)", async () => {
        process.stdin.isTTY = false;

        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(undefined);

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        // Should not prompt, just launch
        expect(mockExeca).toHaveBeenCalledWith("claude", [], {
          stdio: "inherit",
          reject: true,
        });
      });
    });

    describe("adapter configuration", () => {
      it("should warn when adapter not configured for project", async () => {
        process.stdin.isTTY = true;

        // Use the globally mocked readline interface
        mockPrompts.mockResolvedValue({ value: false });

        const consoleSpy = vi.spyOn(console, "log");

        const projectWithoutCline = {
          ...mockProject,
          adapters: ["claude", "gemini"] as ("claude" | "gemini")[],
        };

        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(
          projectWithoutCline,
        );
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: true,
          issues: [],
        });

        await launchTool("cline", [], {
          configPath: "config.json",
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("cline adapter not configured"),
        );
        expect(mockPrompts).toHaveBeenCalledWith({
          type: "confirm",
          name: "value",
          message: 'Add "cline" to adapters in config? [Y/n]',
          initial: true,
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

        // tool is not in ADAPTER_NAMES

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

        // tool is not in ADAPTER_NAMES

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

        // tool is not in ADAPTER_NAMES

        const exitCode = await launchTool("some-tool", [], {
          configPath: "config.json",
        });

        expect(exitCode).toBe(0);
      });
    });

    describe("sync behavior", () => {
      it("should skip sync when --no-sync flag is set", async () => {
        // claude is in adapters object
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
        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          project: "/home/user/project",
          report: {
            success: true,
            changes: {
              written: [
                "/home/user/project/CLAUDE.md",
                "/home/user/project/rules.md",
              ],
            },
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

      it("should verify and prompt for sync when rules out of sync (TTY)", async () => {
        process.stdin.isTTY = true;

        // Use the globally mocked readline interface
        mockPrompts.mockResolvedValue({ value: true });

        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: false,
          issues: [
            { type: "modified", path: "/project/CLAUDE.md" },
            { type: "missing", path: "/project/GEMINI.md" },
          ],
        });
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          project: "/home/user/project",
          report: {
            success: true,
            changes: {
              written: [
                "/home/user/project/CLAUDE.md",
                "/home/user/project/rules.md",
              ],
            },
            errors: [],
          },
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        expect(consoleSpy).toHaveBeenCalledWith("Rules out of sync (2 issues)");
        expect(mockPrompts).toHaveBeenCalledWith({
          type: "confirm",
          name: "value",
          message: "Sync now? [Y/n]",
          initial: true,
        });
        expect(syncModule.syncProject).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith("✓ Synced 2 files");
      });

      it("should skip sync prompt when rules out of sync (non-TTY)", async () => {
        process.stdin.isTTY = false;

        // claude is in adapters object
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(verificationModule.verifyRules).mockResolvedValue({
          synced: false,
          issues: [{ type: "modified", path: "/project/CLAUDE.md" }],
        });

        const consoleSpy = vi.spyOn(console, "log");

        await launchTool("claude", [], {
          configPath: "config.json",
        });

        expect(consoleSpy).toHaveBeenCalledWith("Rules out of sync (1 issue)");
        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockExeca).toHaveBeenCalled();
      });

      it("should show verbose output when verbose flag is set", async () => {
        // claude is in adapters object
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
        // claude is in adapters object
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
        // claude is in adapters object
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
