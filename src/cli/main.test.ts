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

import * as loader from "../config/loader.js";
import * as syncMod from "../core/sync.js";
// launch command removed; no related imports

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

    it("syncs all projects when no --path option is provided", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project1", rules: ["**/*.md"] },
          { path: "/home/user/project2", rules: ["**/*.md"] },
        ],
      });

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project1",
        report: { written: [] },
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).toHaveBeenCalledTimes(2);
    });

    it("syncs only the specific project when --path is provided", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project1", rules: ["**/*.md"] },
          { path: "/home/user/project2", rules: ["**/*.md"] },
        ],
      });

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project2",
        report: { written: [] },
      });

      const code = await main([
        "node",
        "sync-rules",
        "sync",
        "--path",
        "/home/user/project2",
      ]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).toHaveBeenCalledTimes(1);
      expect(syncMod.syncProject).toHaveBeenCalledWith(
        { path: "/home/user/project2", rules: ["**/*.md"] },
        { dryRun: false },
        expect.objectContaining({ rulesSource: "/rules" }),
      );
    });

    it("syncs the most specific project when --path matches nested projects", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project", rules: ["**/*.md"] },
          { path: "/home/user/project/frontend", rules: ["**/*.md"] },
        ],
      });

      vi.mocked(syncMod.syncProject).mockResolvedValue({
        projectPath: "/home/user/project/frontend",
        report: { written: [] },
      });

      const code = await main([
        "node",
        "sync-rules",
        "sync",
        "--path",
        "/home/user/project/frontend/src",
      ]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).toHaveBeenCalledTimes(1);
      expect(syncMod.syncProject).toHaveBeenCalledWith(
        { path: "/home/user/project/frontend", rules: ["**/*.md"] },
        { dryRun: false },
        expect.objectContaining({ rulesSource: "/rules" }),
      );
    });

    it("throws error when --path does not match any configured project", async () => {
      vi.mocked(loader.loadConfig).mockResolvedValue({
        rulesSource: "/rules",
        projects: [
          { path: "/home/user/project1", rules: ["**/*.md"] },
          { path: "/home/user/project2", rules: ["**/*.md"] },
        ],
      });

      const code = await main([
        "node",
        "sync-rules",
        "sync",
        "--path",
        "/home/other/project",
      ]);
      expect(code).toBe(1);
      expect(syncMod.syncProject).not.toHaveBeenCalled();
    });
  });

  // launch command removed

  describe("error handling", () => {
    it("handles unknown commands", async () => {
      const code = await main(["node", "sync-rules", "unknown"]);
      expect(code).toBe(1);
    });

    // no required-arg commands remain
  });
});
