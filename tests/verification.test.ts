import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyRules, openConfigForEditing } from "../src/core/verification.ts";
import * as fs from "node:fs/promises";
import * as registryModule from "../src/adapters/registry.ts";
import * as filesystemModule from "../src/core/rules-fs.ts";
import open from "open";
import { globby } from "globby";
import type { WriteAction } from "../src/utils/content.ts";
import type { Rule } from "../src/core/rules-fs.ts";

vi.mock("node:fs/promises");
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
vi.mock("open", () => ({
  default: vi.fn(),
}));
vi.mock("globby");
vi.mocked(fs.readdir).mockResolvedValue([
  { name: "claude.md", isDirectory: () => false } as any,
]);

// Mock utils to bypass path validation during tests
vi.mock("../src/utils/paths.ts", async () => {
  const actual = (await vi.importActual(
    "../src/utils/paths.ts",
  )) as typeof import("../src/utils/paths.ts");
  return {
    ...actual,
    normalizePath: (path: string) => {
      // Simple normalization for tests without PathGuard validation
      let normalized = path;
      if (path.startsWith("~")) {
        normalized = path.replace("~", "/home/user");
      }
      // Remove trailing slash if not root
      if (normalized.endsWith("/") && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    },
  };
});

describe("verification", () => {
  describe("verifyRules", () => {
    const mockRules: Rule[] = [
      { path: "rule1.md", content: "# Rule 1\nContent" },
      { path: "rule2.md", content: "# Rule 2\nContent" },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("file comparison", () => {
      it("should detect exact match", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/CLAUDE.md",
            content: "test content",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue("test content");

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it("should detect modified files", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/CLAUDE.md",
            content: "expected content",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue("actual content");

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toEqual([
          { type: "modified", path: "/project/CLAUDE.md" },
        ]);
      });

      it("should detect missing files", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/CLAUDE.md",
            content: "test content",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toEqual([
          { type: "missing", path: "/project/CLAUDE.md" },
        ]);
      });
    });

    describe("content normalization", () => {
      it("should handle complex normalization", async () => {
        const content = `# Title

Some content here
With multiple lines`;

        const mockActions: WriteAction[] = [
          { path: "/project/test.md", content },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );

        // File has different formatting
        const actualContent = `\r\n# Title   \r\n        \r\nSome content here  \r\nWith multiple lines\r\n\r\n`;
        vi.mocked(fs.readFile).mockResolvedValue(actualContent);

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(true);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe("path normalization", () => {
      const originalPlatform = process.platform;

      afterEach(() => {
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          writable: false,
        });
      });

      it("should normalize Unix paths", async () => {
        const mockActions: WriteAction[] = [
          { path: "/project/dir/file.md", content: "test" },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue("test");

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(true);
      });

      it("should ignore trailing slashes", async () => {
        const mockActions: WriteAction[] = [
          { path: "/project/dir/file.md", content: "test" },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue("test");
        vi.mocked(fs.readdir).mockResolvedValue([
          { name: "file.md", isDirectory: () => false } as any,
        ]);

        const result = await verifyRules("/project/", "claude", ["**/*.md"]);

        expect(result.synced).toBe(true);
      });

      // Removed: macOS case-insensitive path comparison

      it("should handle case-sensitive comparison on Linux", async () => {
        Object.defineProperty(process, "platform", {
          value: "linux",
          writable: false,
        });

        const mockActions: WriteAction[] = [
          { path: "/project/CLAUDE.md", content: "test" },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
        vi.mocked(fs.readdir).mockResolvedValue([
          { name: "claude.md", isDirectory: () => false } as any,
        ]);

        // On Linux, CLAUDE.md and claude.md are different files
        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toEqual([
          { type: "missing", path: "/project/CLAUDE.md" },
        ]);
      });
    });

    describe("multi-file adapters", () => {
      it("should detect extra files in kilocode adapter", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/.kilocode/rules/rule1.md",
            content: "rule1",
          },
          {
            path: "/project/.kilocode/rules/rule2.md",
            content: "rule2",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.kilocode.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );

        // Mock file reads for expected files
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce("rule1")
          .mockResolvedValueOnce("rule2");

        // Mock globby to include extra file
        vi.mocked(globby).mockResolvedValue([
          "/project/.kilocode/rules/rule1.md",
          "/project/.kilocode/rules/rule2.md",
          "/project/.kilocode/rules/extra.md",
        ]);

        const result = await verifyRules("/project", "kilocode", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toContainEqual({
          type: "extra",
          path: expect.stringContaining("extra.md"),
        });
      });

      it("should detect extra files in cline adapter", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/.clinerules/rule1.md",
            content: "rule1",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.cline.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );

        vi.mocked(fs.readFile).mockResolvedValue("rule1");

        // Mock globby to include extra file
        vi.mocked(globby).mockResolvedValue([
          "/project/.clinerules/rule1.md",
          "/project/.clinerules/old-rule.md",
        ]);

        const result = await verifyRules("/project", "cline", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toContainEqual({
          type: "extra",
          path: expect.stringContaining("old-rule.md"),
        });
      });

      it("should handle nested directories in multi-file adapters", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/.kilocode/rules/rule1.md",
            content: "rule1",
          },
          {
            path: "/project/.kilocode/rules/subdir/rule2.md",
            content: "rule2",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.kilocode.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce("rule1")
          .mockResolvedValueOnce("rule2");

        // Mock globby to return nested files
        vi.mocked(globby).mockResolvedValue([
          "/project/.kilocode/rules/rule1.md",
          "/project/.kilocode/rules/subdir/rule2.md",
        ]);

        const result = await verifyRules("/project", "kilocode", ["**/*.md"]);

        expect(result.synced).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it("should not check for extra files in single-file adapters", async () => {
        const mockActions: WriteAction[] = [
          { path: "/project/CLAUDE.md", content: "test" },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue("test");

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        // Should not call readdir for single-file adapters
        expect(globby).not.toHaveBeenCalled();
        expect(result.synced).toBe(true);
      });

      it("should handle non-existent directories in multi-file adapters", async () => {
        const mockActions: WriteAction[] = [
          {
            path: "/project/.kilocode/rules/rule1.md",
            content: "rule1",
          },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.kilocode.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

        // Mock globby to throw error (directory doesn't exist)
        vi.mocked(globby).mockRejectedValue(new Error("ENOENT"));

        const result = await verifyRules("/project", "kilocode", ["**/*.md"]);

        expect(result.synced).toBe(false);
        expect(result.issues).toEqual([
          { type: "missing", path: "/project/.kilocode/rules/rule1.md" },
        ]);
      });
    });

    describe("direct string comparison", () => {
      it("should use direct comparison for files", async () => {
        const content = "Small content";
        const mockActions: WriteAction[] = [
          { path: "/project/file.md", content },
        ];

        const mockAdapter = vi.fn().mockReturnValue(mockActions);
        vi.mocked(
          registryModule.adapterRegistry.claude.planWrites,
        ).mockImplementation(mockAdapter);
        vi.mocked(filesystemModule.loadRulesFromCentral).mockResolvedValue(
          mockRules,
        );
        vi.mocked(fs.readFile).mockResolvedValue(content);

        const result = await verifyRules("/project", "claude", ["**/*.md"]);

        expect(result.synced).toBe(true);
      });
    });
  });

  describe("openConfigForEditing", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should open config file with default editor and return true", async () => {
      vi.mocked(open).mockResolvedValue({} as any);

      const opened = await openConfigForEditing("/path/to/config.json");

      expect(opened).toBe(true);
      expect(open).toHaveBeenCalledWith("/path/to/config.json", {
        wait: false,
      });
    });

    it("should throw EditorOpenError when open fails", async () => {
      vi.mocked(open).mockRejectedValue(new Error("Failed to open"));

      await expect(
        openConfigForEditing("/path/to/config.json"),
      ).rejects.toThrowError();
    });
  });
});
