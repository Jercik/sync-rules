import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProject } from "./sync.js";
import * as filesystemModule from "./rules-fs.js";
import * as executionModule from "./execution.js";
import type { Project } from "../config/config.js";
import type { Rule } from "./rules-fs.js";
import * as fsPromises from "node:fs/promises";
import type { Stats } from "node:fs";
import type { WriteAction } from "./execution.js";

vi.mock("./rules-fs.js", () => ({
  loadRules: vi.fn(),
}));

vi.mock("./execution.js", () => ({
  executeActions: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  lstat: vi
    .fn()
    .mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
}));

describe("sync", () => {
  describe("syncProject", () => {
    const mockProject: Project = {
      path: "/home/user/project",
      rules: ["**/*.md"],
    };

    const mockRules: Rule[] = [
      { path: "rule1.md", content: "# Rule 1\nContent" },
      { path: "rule2.md", content: "# Rule 2\nContent" },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("writes AGENTS.md with concatenated rules", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: mockRules,
        unmatchedPatterns: [],
      });
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [
          "/home/user/project/AGENTS.md",
          "/home/user/project/CLAUDE.md",
        ],
        skipped: [],
      });

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(filesystemModule.loadRules).toHaveBeenCalledWith(
        expect.any(String),
        ["**/*.md"],
      );
      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(executionModule.executeActions).mock.calls[0];
      const actionsArg: WriteAction[] = callArgs?.[0] ?? [];
      const paths = actionsArg.map((action) => action.path);
      expect(paths).toContain("/home/user/project/AGENTS.md");
      expect(paths).toContain("/home/user/project/CLAUDE.md");
      const claude = actionsArg.find((action) =>
        action.path.endsWith("CLAUDE.md"),
      );
      expect(claude?.content).toBe("@AGENTS.md");
    });

    it("creates CLAUDE.md file referencing AGENTS.md when not dry-run", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: mockRules,
        unmatchedPatterns: [],
      });
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [
          "/home/user/project/AGENTS.md",
          "/home/user/project/CLAUDE.md",
        ],
        skipped: [],
      });

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(executionModule.executeActions).mock.calls[0];
      const actionsArg: WriteAction[] = callArgs?.[0] ?? [];
      const claude = actionsArg.find((action) =>
        action.path.endsWith("CLAUDE.md"),
      );
      expect(claude?.content).toBe("@AGENTS.md");
    });

    it("does not attempt extra writes in dry-run mode", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: mockRules,
        unmatchedPatterns: [],
      });
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
        skipped: [],
      });

      await syncProject(
        mockProject,
        { dryRun: true },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(executionModule.executeActions).mock.calls[0];
      const actionsArg: WriteAction[] = callArgs?.[0] ?? [];
      const paths = actionsArg.map((action) => action.path);
      expect(paths).toContain("/home/user/project/AGENTS.md");
      expect(paths).toContain("/home/user/project/CLAUDE.md");
    });

    it("writes CLAUDE.md when AGENTS.md exists but no rules were selected", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: [],
        unmatchedPatterns: [],
      });
      vi.mocked(executionModule.executeActions)
        .mockResolvedValueOnce({ written: [], skipped: [] }) // first call (no actions)
        .mockResolvedValueOnce({
          written: ["/home/user/project/CLAUDE.md"],
          skipped: [],
        }); // second call to write CLAUDE.md

      // Simulate AGENTS.md existing already
      vi.mocked(fsPromises.lstat).mockResolvedValueOnce({} as unknown as Stats);

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(2);
      const secondCallArgs = vi.mocked(executionModule.executeActions).mock
        .calls[1];
      const secondActions: WriteAction[] = secondCallArgs?.[0] ?? [];
      const paths = secondActions.map((action) => action.path);
      expect(paths).toEqual(["/home/user/project/CLAUDE.md"]);
      const [claude] = secondActions;
      expect(claude?.content).toBe("@AGENTS.md");
    });
  });
});
