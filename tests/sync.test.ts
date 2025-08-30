import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProject } from "../src/core/sync.ts";
import * as adaptersModule from "../src/adapters/adapters.ts";
import * as filesystemModule from "../src/core/filesystem.ts";
import * as executionModule from "../src/core/execution.ts";
import type { Project } from "../src/config/config.ts";
import type { WriteAction } from "../src/utils/content.ts";
import type { Rule } from "../src/core/filesystem.ts";
import { SyncError } from "../src/utils/errors.ts";

vi.mock("../src/adapters/adapters.ts", () => ({
  adapters: {
    claude: {
      generateActions: vi.fn(),
      meta: { type: "single-file", location: "CLAUDE.md" },
    },
    gemini: {
      generateActions: vi.fn(),
      meta: { type: "single-file", location: "GEMINI.md" },
    },
    kilocode: {
      generateActions: vi.fn(),
      meta: { type: "multi-file", directory: ".kilocode/rules" },
    },
    cline: {
      generateActions: vi.fn(),
      meta: { type: "multi-file", directory: ".clinerules" },
    },
    codex: {
      generateActions: vi.fn(),
      meta: { type: "single-file", location: "AGENTS.md" },
    },
  },
}));

vi.mock("../src/core/filesystem.ts", () => ({
  loadRulesFromCentral: vi.fn(),
}));

vi.mock("../src/core/execution.ts", () => ({
  executeActions: vi.fn(),
}));

describe("sync", () => {
  describe("syncProject", () => {
    const mockProject: Project = {
      path: "/home/user/project",
      rules: ["**/*.md"],
      adapters: ["claude", "gemini"],
    };

    const mockRules: Rule[] = [
      { path: "rule1.md", content: "# Rule 1\nContent" },
      { path: "rule2.md", content: "# Rule 2\nContent" },
    ];

    const mockActions: WriteAction[] = [
      { path: "/home/user/project/CLAUDE.md", content: "test" },
      { path: "/home/user/project/GEMINI.md", content: "test2" },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should sync project with single adapter", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [mockActions[0].path],
        },
        errors: [],
      });

      const result = await syncProject(singleAdapterProject);

      expect(filesystemModule.loadRulesFromCentral).toHaveBeenCalledWith(
        expect.any(String),
        ["**/*.md"],
      );
      expect(adaptersModule.adapters.claude.generateActions).toHaveBeenCalled();
      expect(mockAdapter).toHaveBeenCalledWith({
        projectPath: "/home/user/project",
        rules: mockRules,
      });
      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        { dryRun: false, verbose: false, pathGuard: undefined },
      );
      expect(result).toEqual({
        projectPath: "/home/user/project",
        report: {
          success: true,
          changes: {
            written: [mockActions[0].path],
          },
          errors: [],
        },
      });
    });

    it("should sync project with multiple adapters", async () => {
      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const claudeAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      const geminiAdapter = vi.fn().mockReturnValue([mockActions[1]]);

      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(claudeAdapter);
      vi.mocked(
        adaptersModule.adapters.gemini.generateActions,
      ).mockImplementation(geminiAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [mockActions[0].path, mockActions[1].path],
        },
        errors: [],
      });

      const result = await syncProject(mockProject);

      expect(adaptersModule.adapters.claude.generateActions).toHaveBeenCalled();
      expect(adaptersModule.adapters.gemini.generateActions).toHaveBeenCalled();
      expect(claudeAdapter).toHaveBeenCalledWith({
        projectPath: "/home/user/project",
        rules: mockRules,
      });
      expect(geminiAdapter).toHaveBeenCalledWith({
        projectPath: "/home/user/project",
        rules: mockRules,
      });
      expect(executionModule.executeActions).toHaveBeenCalledWith(mockActions, {
        dryRun: false,
        verbose: false,
        pathGuard: undefined,
      });
      expect(result.report.changes.written).toHaveLength(2);
    });

    it("should respect dry-run mode", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [],
        },
        errors: [],
      });

      await syncProject(singleAdapterProject, { dryRun: true });

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        { dryRun: true, verbose: false, pathGuard: undefined },
      );
    });

    it("should respect verbose mode", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [mockActions[0].path],
        },
        errors: [],
      });

      await syncProject(singleAdapterProject, { verbose: true });

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        { dryRun: false, verbose: true, pathGuard: undefined },
      );
    });

    it("should handle adapter failures", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const adapterError = new Error("Adapter processing failed");
      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(() => {
        throw adapterError;
      });

      // Should throw error with context details
      await expect(syncProject(singleAdapterProject)).rejects.toThrow(Error);

      try {
        await syncProject(singleAdapterProject);
      } catch (error) {
        expect(error).toBeInstanceOf(SyncError);
        if (error instanceof SyncError) {
          expect(error.message).toBe("Failed to process adapter 'claude'");
          expect(error.details.adapter).toBe("claude");
          expect(error.details.project).toBe("/home/user/project");
        }
      }

      // Should fail before reaching executeActions
      expect(executionModule.executeActions).not.toHaveBeenCalled();
    });

    it("should load rules only once for all adapters", async () => {
      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const mockAdapter = vi.fn().mockReturnValue([]);
      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [],
        },
        errors: [],
      });

      await syncProject(mockProject);

      // Should only load rules once, not twice (one per adapter)
      expect(filesystemModule.loadRulesFromCentral).toHaveBeenCalledTimes(1);
    });

    it("should combine actions from all adapters", async () => {
      vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
        mockRules,
      );

      const claudeActions = [
        {
          type: "write" as const,
          path: "/project/CLAUDE.md",
          content: "claude",
        },
      ];

      const geminiActions = [
        {
          type: "write" as const,
          path: "/project/GEMINI.md",
          content: "gemini",
        },
      ];

      vi.mocked(
        adaptersModule.adapters.claude.generateActions,
      ).mockImplementation(() => claudeActions);
      vi.mocked(
        adaptersModule.adapters.gemini.generateActions,
      ).mockImplementation(() => geminiActions);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        changes: {
          written: [mockActions[0].path, mockActions[1].path],
        },
        errors: [],
      });

      await syncProject(mockProject);

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [...claudeActions, ...geminiActions],
        { dryRun: false, verbose: false, pathGuard: undefined },
      );
    });
  });
});
