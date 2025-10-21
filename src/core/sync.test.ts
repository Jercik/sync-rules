import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProject } from "./sync.js";
import * as filesystemModule from "./rules-fs.js";
import * as executionModule from "./execution.js";
import type { Project } from "../config/config.js";
import type { Rule } from "./rules-fs.js";
import * as fsPromises from "node:fs/promises";
import type { Stats } from "node:fs";

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
  rm: vi.fn(),
  symlink: vi.fn(),
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
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: ["/home/user/project/AGENTS.md"],
      });

      const result = await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(filesystemModule.loadRules).toHaveBeenCalledWith(
        expect.any(String),
        ["**/*.md"],
      );
      expect(executionModule.executeActions).toHaveBeenCalled();
      const actionsArg = vi.mocked(executionModule.executeActions).mock
        .calls[0]?.[0];
      expect(actionsArg?.[0]?.path).toBe("/home/user/project/AGENTS.md");
      expect(actionsArg?.[0]?.content).toContain("# AGENTS.md");
      expect(result.report.written).toEqual(["/home/user/project/AGENTS.md"]);
    });

    it("creates CLAUDE.md symlink to AGENTS.md when not dry-run", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: ["/home/user/project/AGENTS.md"],
      });

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(fsPromises.symlink).toHaveBeenCalledWith(
        "AGENTS.md",
        "/home/user/project/CLAUDE.md",
      );
    });

    it("does not attempt symlink in dry-run mode", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
      });

      await syncProject(
        mockProject,
        { dryRun: true },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(fsPromises.symlink).not.toHaveBeenCalled();
    });

    it("removes existing CLAUDE.md before creating symlink", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: ["/home/user/project/AGENTS.md"],
      });

      // lstat resolves to an object to simulate existence
      vi.mocked(fsPromises.lstat).mockResolvedValueOnce({} as unknown as Stats);

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(fsPromises.rm).toHaveBeenCalledWith(
        "/home/user/project/CLAUDE.md",
        { force: true },
      );
      expect(fsPromises.symlink).toHaveBeenCalled();
    });
  });
});
