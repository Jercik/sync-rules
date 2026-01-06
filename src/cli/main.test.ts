import { homedir } from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { main } from "./main.js";
import { DEFAULT_CONFIG_PATH } from "../config/constants.js";

// Mock the entire modules with dynamic imports support
vi.mock("../config/loader.js", () => ({
  loadConfig: vi.fn(),
  createSampleConfig: vi.fn(),
}));

vi.mock("../core/sync.js", () => ({
  syncProject: vi.fn(),
}));

vi.mock("../core/sync-global.js", () => ({
  syncGlobal: vi
    .fn()
    .mockResolvedValue({ written: [], skipped: [], unmatchedPatterns: [] }),
}));

import * as loader from "../config/loader.js";
import * as syncModule from "../core/sync.js";
import * as syncGlobalModule from "../core/sync-global.js";

describe("cli/main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("init command", () => {
    it("creates sample config at default path", async () => {
      vi.mocked(loader.createSampleConfig).mockResolvedValue();

      const code = await main(["node", "sync-rules", "init"]);
      expect(code).toBe(0);
      expect(loader.createSampleConfig).toHaveBeenCalledWith(
        DEFAULT_CONFIG_PATH,
        false,
      );
    });

    it("honors --force flag", async () => {
      vi.mocked(loader.createSampleConfig).mockResolvedValue();

      const code = await main(["node", "sync-rules", "init", "--force"]);
      expect(code).toBe(0);
      expect(loader.createSampleConfig).toHaveBeenCalledWith(
        DEFAULT_CONFIG_PATH,
        true,
      );
    });

    it("handles init errors gracefully", async () => {
      vi.mocked(loader.createSampleConfig).mockRejectedValue(
        new Error("Write failed"),
      );

      const code = await main(["node", "sync-rules", "init"]);
      expect(code).toBe(1);
    });
  });

  describe("config-path command", () => {
    it("prints the default config path", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await main(["node", "sync-rules", "config-path"]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH);
      logSpy.mockRestore();
    });

    it("prints custom config path when --config is provided", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await main([
        "node",
        "sync-rules",
        "--config",
        "./custom.json",
        "config-path",
      ]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(path.resolve("./custom.json"));
      logSpy.mockRestore();
    });

    it("expands tilde in config path", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await main([
        "node",
        "sync-rules",
        "--config",
        "~/.config/sync-rules.json",
        "config-path",
      ]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        path.resolve(homedir(), ".config/sync-rules.json"),
      );
      logSpy.mockRestore();
    });
  });

  describe("sync command (default)", () => {
    it("handles empty project list", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [],
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncModule.syncProject).not.toHaveBeenCalled();
    });

    it("syncs all configured projects", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project1", rules: ["**/*.md"] },
          { path: "/home/user/project2", rules: ["**/*.md"] },
        ],
      });

      vi.mocked(syncModule.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
        unmatchedPatterns: [],
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncModule.syncProject).toHaveBeenCalledTimes(2);
    });

    it("passes dryRun: false by default", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [{ path: "/home/user/project1", rules: ["**/*.md"] }],
      });

      vi.mocked(syncModule.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
        unmatchedPatterns: [],
      });

      await main(["node", "sync-rules"]);

      expect(syncGlobalModule.syncGlobal).toHaveBeenCalledWith(
        { dryRun: false },
        expect.any(Object),
      );
      expect(syncModule.syncProject).toHaveBeenCalledWith(
        expect.any(Object),
        { dryRun: false },
        expect.any(Object),
      );
    });

    it("passes dryRun: true with --dry-run flag", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [{ path: "/home/user/project1", rules: ["**/*.md"] }],
      });

      vi.mocked(syncModule.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
        unmatchedPatterns: [],
      });

      await main(["node", "sync-rules", "--dry-run"]);

      expect(syncGlobalModule.syncGlobal).toHaveBeenCalledWith(
        { dryRun: true },
        expect.any(Object),
      );
      expect(syncModule.syncProject).toHaveBeenCalledWith(
        expect.any(Object),
        { dryRun: true },
        expect.any(Object),
      );
    });

    it("implies dryRun: true with --porcelain flag", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [{ path: "/home/user/project1", rules: ["**/*.md"] }],
      });

      vi.mocked(syncModule.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
        unmatchedPatterns: [],
      });

      await main(["node", "sync-rules", "--porcelain"]);

      expect(syncGlobalModule.syncGlobal).toHaveBeenCalledWith(
        { dryRun: true },
        expect.any(Object),
      );
      expect(syncModule.syncProject).toHaveBeenCalledWith(
        expect.any(Object),
        { dryRun: true },
        expect.any(Object),
      );
    });

    it("outputs warnings for unmatched patterns", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        global: ["global/*.md"],
        projects: [{ path: "/home/user/project1", rules: ["**/*.md"] }],
      });

      vi.mocked(syncGlobalModule.syncGlobal).mockResolvedValue({
        written: [],
        skipped: [],
        unmatchedPatterns: ["global/*.md"],
      });

      vi.mocked(syncModule.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
        unmatchedPatterns: ["missing-pattern/*.md"],
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await main(["node", "sync-rules"]);

      // Check that warnings were printed
      expect(errorSpy).toHaveBeenCalledWith(
        "Warning: The following patterns did not match any rules:",
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "  • global/*.md (in global config)",
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "  • missing-pattern/*.md (in /home/user/project1)",
      );

      errorSpy.mockRestore();
    });
  });

  // launch command removed

  describe("error handling", () => {
    it("does not print errors for --help or --version", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const helpCode = await main(["node", "sync-rules", "--help"]);
      expect(helpCode).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockClear();

      const versionCode = await main(["node", "sync-rules", "--version"]);
      expect(versionCode).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("prints an error for invalid commands", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await main(["node", "sync-rules", "unknown"]);
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    // no required-arg commands remain
  });
});
