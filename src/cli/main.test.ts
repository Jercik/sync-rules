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
  syncGlobal: vi.fn().mockResolvedValue({ written: [] }),
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
        report: { written: [] },
      });

      const code = await main(["node", "sync-rules"]);
      expect(code).toBe(0);
      expect(syncMod.syncProject).toHaveBeenCalledTimes(2);
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
