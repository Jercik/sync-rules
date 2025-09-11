import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../launch/spawn.js", () => ({
  spawnProcess: vi.fn(),
}));

// Use real adapterRegistry instead of mocking
vi.mock("../config/config.js", () => ({
  findProjectForPath: vi.fn(),
}));
vi.mock("../config/loader.js");
vi.mock("../core/sync.js");

import { launchTool } from "./launch.js";
import * as configModule from "../config/config.js";
import * as configLoaderModule from "../config/loader.js";
import * as syncModule from "../core/sync.js";
import { spawnProcess } from "../launch/spawn.js";
import type { Config, Project } from "../config/config.js";
import {
  AdapterNotConfiguredError,
  ConfigNotFoundError,
} from "../utils/errors.js";

const mockSpawnProcess = vi.mocked(spawnProcess);

describe("launch", () => {
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

    const mockProject = mockConfig.projects[0] as Project;

    let originalCwd: () => string;

    beforeEach(() => {
      vi.clearAllMocks();

      originalCwd = process.cwd.bind(process);

      process.cwd = vi.fn().mockReturnValue("/home/user/project");

      mockSpawnProcess.mockResolvedValue(0);

      vi.mocked(configLoaderModule.loadConfig).mockResolvedValue(mockConfig);

      // adapter registry is already mocked in the module mock
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    describe("tool detection", () => {
      it("managed tool: loads config, finds project, syncs, then spawns", async () => {
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        await launchTool("claude", ["--chat"], {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(configModule.findProjectForPath).toHaveBeenCalled();
        expect(mockSpawnProcess).toHaveBeenCalledWith("claude", ["--chat"]);
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("Rules already up to date"),
        );
        logSpy.mockRestore();
      });

      it("unmanaged tool: spawns directly without config", async () => {
        // git is not in adapterNames
        const result = await launchTool("git", ["status"], {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(configModule.findProjectForPath).not.toHaveBeenCalled();
        expect(syncModule.syncProject).not.toHaveBeenCalled();
        expect(mockSpawnProcess).toHaveBeenCalledWith("git", ["status"]);
        expect(result.exitCode).toBe(0);
      });
    });

    describe("argument passing", () => {
      it("forwards arguments verbatim to spawned process", async () => {
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        // Test complex arguments with spaces and JSON
        const args = [
          "--chat",
          "--message",
          "hello world",
          "--data",
          '{"key": "value"}',
        ];
        await launchTool("claude", args, {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(mockSpawnProcess).toHaveBeenCalledWith("claude", args);
      });
    });

    describe("config file handling", () => {
      it("launchTool uses loadConfig with provided config path", async () => {
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: {
            written: [],
          },
        });

        await launchTool("claude", [], {
          configPath: "custom-config.json",
          delayMs: 0,
        });

        expect(configLoaderModule.loadConfig).toHaveBeenCalledWith(
          "custom-config.json",
        );
      });

      it("warns and spawns when no project matches cwd", async () => {
        vi.mocked(configModule.findProjectForPath).mockReturnValue(undefined);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const result = await launchTool("claude", [], {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(mockSpawnProcess).toHaveBeenCalled();
        expect(result.exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("not listed in config"),
        );
        logSpy.mockRestore();
      });

      it("launchTool throws AdapterNotConfiguredError when adapter not in project", async () => {
        const projectWithoutClaude = {
          ...mockProject,
          adapters: ["gemini"], // claude not included
        };

        vi.mocked(configModule.findProjectForPath).mockReturnValue(
          projectWithoutClaude,
        );

        await expect(
          launchTool("claude", [], {
            configPath: "config.json",
            delayMs: 0,
          }),
        ).rejects.toBeInstanceOf(AdapterNotConfiguredError);
      });

      it("warns and spawns when config file is missing", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(configLoaderModule.loadConfig).mockRejectedValue(
          new ConfigNotFoundError("config.json", true),
        );

        const result = await launchTool("claude", [], {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(mockSpawnProcess).toHaveBeenCalled();
        expect(result.exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("No config found"),
        );
        logSpy.mockRestore();
      });
    });

    describe("sync behavior", () => {
      it("launchTool syncs project before spawning managed tool", async () => {
        vi.mocked(configModule.findProjectForPath).mockReturnValue(mockProject);
        vi.mocked(syncModule.syncProject).mockResolvedValue({
          projectPath: "/home/user/project",
          report: { written: ["/home/user/project/CLAUDE.md"] },
        });

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        await launchTool("claude", [], {
          configPath: "config.json",
          delayMs: 0,
        });

        expect(syncModule.syncProject).toHaveBeenCalledWith(
          mockProject,
          { dryRun: false },
          mockConfig,
        );
        expect(mockSpawnProcess).toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("Synchronized 1 file"),
        );
        logSpy.mockRestore();
      });
    });

    describe("Windows-style detection", () => {
      it.each([{ tool: "CLAUDE.EXE", adapter: "claude", args: ["--arg"] }])(
        "recognizes managed tools with .exe/.cmd and case differences",
        async ({ tool, adapter, args }) => {
          const projectWithAdapter: Project = {
            path: "/project",
            rules: ["rules.md"],
            adapters: [adapter],
          };

          vi.mocked(configModule.findProjectForPath).mockReturnValue(
            projectWithAdapter,
          );
          vi.mocked(syncModule.syncProject).mockResolvedValue({
            projectPath: "/project",
            report: { written: [] },
          });
          mockSpawnProcess.mockResolvedValue(0);

          await launchTool(tool, args, {
            configPath: "config.json",
            delayMs: 0,
          });

          expect(syncModule.syncProject).toHaveBeenCalled();
          expect(mockSpawnProcess).toHaveBeenCalledWith(tool, args);
        },
      );
    });
  });
});
