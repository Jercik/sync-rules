import { homedir } from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { main } from "./main.js";
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_RULES_SOURCE,
} from "../config/constants.js";
import { ConfigNotFoundError, ConfigParseError } from "../utils/errors.js";

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

  describe("--init", () => {
    it("creates sample config at default path", async () => {
      vi.mocked(loader.createSampleConfig).mockResolvedValue();

      const code = await main(["node", "sync-rules", "--init"]);
      expect(code).toBe(0);
      expect(loader.createSampleConfig).toHaveBeenCalledWith(
        DEFAULT_CONFIG_PATH,
        false,
      );
    });

    it("honors --force flag", async () => {
      vi.mocked(loader.createSampleConfig).mockResolvedValue();

      const code = await main(["node", "sync-rules", "--init", "--force"]);
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

      const code = await main(["node", "sync-rules", "--init"]);
      expect(code).toBe(1);
    });
  });

  describe("--paths", () => {
    it("prints the resolved config and rules source paths", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [],
      });

      const code = await main(["node", "sync-rules", "--paths"]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("NAME\tPATH");
      expect(logSpy).toHaveBeenCalledWith(`CONFIG\t${DEFAULT_CONFIG_PATH}`);
      expect(logSpy).toHaveBeenCalledWith("RULES_SOURCE\t/rules");
      logSpy.mockRestore();
    });

    it("prints defaults when config is missing", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.mocked(loader.loadConfig).mockRejectedValue(
        new ConfigNotFoundError(DEFAULT_CONFIG_PATH, true),
      );

      const code = await main(["node", "sync-rules", "--paths"]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("NAME\tPATH");
      expect(logSpy).toHaveBeenCalledWith(`CONFIG\t${DEFAULT_CONFIG_PATH}`);
      expect(logSpy).toHaveBeenCalledWith(
        `RULES_SOURCE\t${DEFAULT_RULES_SOURCE}`,
      );
      logSpy.mockRestore();
    });

    it("prints custom config path when --config is provided", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [],
      });

      const code = await main([
        "node",
        "sync-rules",
        "--config",
        "./custom.json",
        "--paths",
      ]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        `CONFIG\t${path.resolve("./custom.json")}`,
      );
      logSpy.mockRestore();
    });

    it("expands tilde in config path", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [],
      });

      const code = await main([
        "node",
        "sync-rules",
        "--config",
        "~/.config/sync-rules.json",
        "--paths",
      ]);

      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        `CONFIG\t${path.resolve(homedir(), ".config/sync-rules.json")}`,
      );
      logSpy.mockRestore();
    });

    it("prints paths and exits non-zero on config parse errors", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(loader.loadConfig).mockRejectedValue(
        new ConfigParseError(DEFAULT_CONFIG_PATH, new Error("Bad config")),
      );

      const code = await main(["node", "sync-rules", "--paths"]);

      expect(code).toBe(1);
      expect(logSpy).toHaveBeenCalledWith("NAME\tPATH");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load config"),
      );
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("flag validation", () => {
    it("rejects --force without --init", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const code = await main(["node", "sync-rules", "--force"]);

      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        "--force can only be used with --init",
      );
      errorSpy.mockRestore();
    });

    it("rejects --init with --paths", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const code = await main(["node", "sync-rules", "--init", "--paths"]);

      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        "Use only one of --init or --paths",
      );
      errorSpy.mockRestore();
    });

    it("rejects --dry-run with --init", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const code = await main(["node", "sync-rules", "--init", "--dry-run"]);

      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        "--dry-run and --porcelain apply only to sync",
      );
      errorSpy.mockRestore();
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
