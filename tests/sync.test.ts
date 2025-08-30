import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProject } from "../src/core/sync.ts";
import * as registryModule from "../src/adapters/registry.ts";
import * as filesystemModule from "../src/core/rules-fs.ts";
import * as executionModule from "../src/core/execution.ts";
import type { Project } from "../src/config/config.ts";
import type { WriteAction } from "../src/utils/content.ts";
import type { Rule } from "../src/core/rules-fs.ts";
import { SyncError } from "../src/utils/errors.ts";

vi.mock("../src/adapters/adapters.ts", () => ({
  adapterFromMeta: vi.fn(),
}));

vi.mock("../src/adapters/registry.ts", () => ({
  adapterRegistry: {
    claude: {
      planWrites: vi.fn(),
      meta: { type: "single-file", location: "CLAUDE.md" },
    },
    gemini: {
      planWrites: vi.fn(),
      meta: { type: "single-file", location: "GEMINI.md" },
    },
    kilocode: {
      planWrites: vi.fn(),
      meta: { type: "multi-file", directory: ".kilocode/rules" },
    },
    cline: {
      planWrites: vi.fn(),
      meta: { type: "multi-file", directory: ".clinerules" },
    },
    codex: {
      planWrites: vi.fn(),
      meta: { type: "single-file", location: "AGENTS.md" },
    },
  },
}));

vi.mock("../src/core/rules-fs.ts", () => ({
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [mockActions[0].path],
        errors: [],
      });

      const result = await syncProject(singleAdapterProject);

      expect(filesystemModule.loadRulesFromCentral).toHaveBeenCalledWith(
        expect.any(String),
        ["**/*.md"],
      );
      expect(
        registryModule.adapterRegistry.claude.planWrites,
      ).toHaveBeenCalled();
      expect(mockAdapter).toHaveBeenCalledWith({
        projectPath: "/home/user/project",
        rules: mockRules,
      });
      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        {
          dryRun: false,
          verbose: false,
          pathGuard: expect.objectContaining({
            validatePath: expect.any(Function),
            getAllowedRoots: expect.any(Function),
            isInsideAllowedRoot: expect.any(Function),
          }),
        },
      );
      expect(result).toEqual({
        projectPath: "/home/user/project",
        report: {
          success: true,
          written: [mockActions[0].path],
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(claudeAdapter);
      vi.mocked(
        registryModule.adapterRegistry.gemini.planWrites,
      ).mockImplementation(geminiAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [mockActions[0].path, mockActions[1].path],
        errors: [],
      });

      const result = await syncProject(mockProject);

      expect(
        registryModule.adapterRegistry.claude.planWrites,
      ).toHaveBeenCalled();
      expect(
        registryModule.adapterRegistry.gemini.planWrites,
      ).toHaveBeenCalled();
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
        pathGuard: expect.objectContaining({
          validatePath: expect.any(Function),
          getAllowedRoots: expect.any(Function),
          isInsideAllowedRoot: expect.any(Function),
        }),
      });
      expect(result.report.written).toHaveLength(2);
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [],
        errors: [],
      });

      await syncProject(singleAdapterProject, { dryRun: true });

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        {
          dryRun: true,
          verbose: false,
          pathGuard: expect.objectContaining({
            validatePath: expect.any(Function),
            getAllowedRoots: expect.any(Function),
            isInsideAllowedRoot: expect.any(Function),
          }),
        },
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [mockActions[0].path],
        errors: [],
      });

      await syncProject(singleAdapterProject, { verbose: true });

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        {
          dryRun: false,
          verbose: true,
          pathGuard: expect.objectContaining({
            validatePath: expect.any(Function),
            getAllowedRoots: expect.any(Function),
            isInsideAllowedRoot: expect.any(Function),
          }),
        },
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(() => {
        throw adapterError;
      });

      // Should throw error with context details
      await expect(syncProject(singleAdapterProject)).rejects.toThrow(Error);

      try {
        await syncProject(singleAdapterProject);
      } catch (error) {
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
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [],
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
          path: "/project/CLAUDE.md",
          content: "claude",
        },
      ];

      const geminiActions = [
        {
          path: "/project/GEMINI.md",
          content: "gemini",
        },
      ];

      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(() => claudeActions);
      vi.mocked(
        registryModule.adapterRegistry.gemini.planWrites,
      ).mockImplementation(() => geminiActions);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        success: true,
        written: [mockActions[0].path, mockActions[1].path],
        errors: [],
      });

      await syncProject(mockProject);

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [...claudeActions, ...geminiActions],
        {
          dryRun: false,
          verbose: false,
          pathGuard: expect.objectContaining({
            validatePath: expect.any(Function),
            getAllowedRoots: expect.any(Function),
            isInsideAllowedRoot: expect.any(Function),
          }),
        },
      );
    });
  });
});
