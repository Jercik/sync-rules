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
  syncGlobal: vi.fn().mockResolvedValue({ written: [], skipped: [] }),
}));

import * as loader from "../config/loader.js";
import * as syncMod from "../core/sync.js";
import * as syncGlobalMod from "../core/sync-global.js";

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

  describe("sync command (default)", () => {
    it("handles empty project list", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [],
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).not.toHaveBeenCalled();
    });

    it("syncs all configured projects", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project1", rules: ["**/*.md"] },
          { path: "/home/user/project2", rules: ["**/*.md"] },
        ],
      });

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).toHaveBeenCalledTimes(2);
    });

    it("passes dryRun: false by default", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [{ path: "/home/user/project1", rules: ["**/*.md"] }],
      });

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
      });

      await main(["node", "sync-rules"]);

      expect(syncGlobalMod.syncGlobal).toHaveBeenCalledWith(
        { dryRun: false },
        expect.any(Object),
      );
      expect(syncMod.syncProject).toHaveBeenCalledWith(
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

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
      });

      await main(["node", "sync-rules", "--dry-run"]);

      expect(syncGlobalMod.syncGlobal).toHaveBeenCalledWith(
        { dryRun: true },
        expect.any(Object),
      );
      expect(syncMod.syncProject).toHaveBeenCalledWith(
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

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [], skipped: [] },
      });

      await main(["node", "sync-rules", "--porcelain"]);

      expect(syncGlobalMod.syncGlobal).toHaveBeenCalledWith(
        { dryRun: true },
        expect.any(Object),
      );
      expect(syncMod.syncProject).toHaveBeenCalledWith(
        expect.any(Object),
        { dryRun: true },
        expect.any(Object),
      );
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

    it("handles unknown commands", async () => {
      const code = await main(["node", "sync-rules", "unknown"]);
      expect(code).toBe(1);
    });

    // no required-arg commands remain
  });
});
