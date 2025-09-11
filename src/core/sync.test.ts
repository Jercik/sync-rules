import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProject } from "./sync.js";
import * as registryModule from "../adapters/registry.js";
import * as filesystemModule from "./rules-fs.js";
import * as executionModule from "./execution.js";
import type { Project } from "../config/config.js";
import type { WriteAction } from "./execution.js";
import type { Rule } from "./rules-fs.js";
import { SyncError } from "../utils/errors.js";

vi.mock("../adapters/registry.js", () => {
  const adapterRegistry = {
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
  } as const;

  const isAdapterName = (name: string): boolean => name in adapterRegistry;

  return { adapterRegistry, isAdapterName };
});

vi.mock("./rules-fs.js", () => ({
  loadRules: vi.fn(),
}));

vi.mock("./execution.js", () => ({
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

      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      const firstAction = mockActions[0];
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: firstAction ? [firstAction.path] : [],
      });

      const result = await syncProject(
        singleAdapterProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(filesystemModule.loadRules).toHaveBeenCalledWith(
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
        },
      );
      const firstActionPath = mockActions[0];
      expect(result).toEqual({
        projectPath: "/home/user/project",
        report: {
          written: firstActionPath ? [firstActionPath.path] : [],
        },
      });
    });

    it("should sync project with multiple adapters", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const claudeAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      const geminiAdapter = vi.fn().mockReturnValue([mockActions[1]]);

      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(claudeAdapter);
      vi.mocked(
        registryModule.adapterRegistry.gemini.planWrites,
      ).mockImplementation(geminiAdapter);

      const firstAction = mockActions[0];
      const secondAction = mockActions[1];
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [
          ...(firstAction ? [firstAction.path] : []),
          ...(secondAction ? [secondAction.path] : []),
        ],
      });

      const result = await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

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
      });
      expect(result.report.written).toHaveLength(2);
    });

    it("should respect dry-run mode", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
      });

      await syncProject(
        singleAdapterProject,
        { dryRun: true },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        {
          dryRun: true,
        },
      );
    });

    it("executes planned adapter actions (smoke)", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const mockAdapter = vi.fn().mockReturnValue([mockActions[0]]);
      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      const firstAction = mockActions[0];
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: firstAction ? [firstAction.path] : [],
      });

      await syncProject(
        singleAdapterProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [mockActions[0]],
        {
          dryRun: false,
        },
      );
    });

    it("should handle adapter failures", async () => {
      const singleAdapterProject: Project = {
        ...mockProject,
        adapters: ["claude"],
      };

      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const adapterError = new Error("Adapter processing failed");
      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(() => {
        throw adapterError;
      });

      await expect(
        syncProject(
          singleAdapterProject,
          { dryRun: false },
          { rulesSource: "/path/to/rules", projects: [] },
        ),
      ).rejects.toThrow(Error);

      try {
        await syncProject(
          singleAdapterProject,
          { dryRun: false },
          { rulesSource: "/path/to/rules", projects: [] },
        );
      } catch (error) {
        if (error instanceof SyncError) {
          expect(error.message).toBe("Failed to process adapter 'claude'");
          expect(error.details.adapter).toBe("claude");
          expect(error.details.project).toBe("/home/user/project");
        }
      }

      expect(executionModule.executeActions).not.toHaveBeenCalled();
    });

    it("should load rules only once for all adapters", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

      const mockAdapter = vi.fn().mockReturnValue([]);
      vi.mocked(
        registryModule.adapterRegistry.claude.planWrites,
      ).mockImplementation(mockAdapter);

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
      });

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(filesystemModule.loadRules).toHaveBeenCalledTimes(1);
    });

    it("should combine actions from all adapters", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue(mockRules);

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

      const firstAction = mockActions[0];
      const secondAction = mockActions[1];
      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [
          ...(firstAction ? [firstAction.path] : []),
          ...(secondAction ? [secondAction.path] : []),
        ],
      });

      await syncProject(
        mockProject,
        { dryRun: false },
        { rulesSource: "/path/to/rules", projects: [] },
      );

      expect(executionModule.executeActions).toHaveBeenCalledWith(
        [...claudeActions, ...geminiActions],
        {
          dryRun: false,
        },
      );
    });
  });
});
