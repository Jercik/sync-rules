import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncGlobal } from "./sync-global.js";
import * as filesystemModule from "./rules-fs.js";
import * as executionModule from "./execution.js";
import type { Rule } from "./rules-fs.js";
import type { WriteAction } from "./execution.js";

vi.mock("./rules-fs.js", () => ({
  loadRules: vi.fn(),
  globRulePaths: vi.fn(),
}));

vi.mock("./execution.js", () => ({
  executeActions: vi.fn(),
}));

describe("sync-global", () => {
  const mockRules: Rule[] = [
    { path: "g1.md", content: "# G1\nA" },
    { path: "g2.md", content: "# G2\nB" },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns no writes when no global patterns configured", async () => {
    const result = await syncGlobal(
      { dryRun: false },
      {
        rulesSource: "/rules",
      },
    );
    expect(result.written).toEqual([]);
  });

  it("returns no writes when no rules match", async () => {
    vi.mocked(filesystemModule.loadRules).mockResolvedValue({
      rules: [],
      unmatchedPatterns: ["global-rules/*.md"],
    });
    const result = await syncGlobal(
      { dryRun: false },
      {
        rulesSource: "/rules",
        global: ["global-rules/*.md"],
      },
    );
    expect(filesystemModule.loadRules).toHaveBeenCalled();
    expect(result.written).toEqual([]);
    expect(result.unmatchedPatterns).toEqual(["global-rules/*.md"]);
  });

  it("writes combined content to all global targets", async () => {
    vi.mocked(filesystemModule.loadRules).mockResolvedValue({
      rules: mockRules,
      unmatchedPatterns: [],
    });

    vi.mocked(executionModule.executeActions).mockResolvedValue({
      written: ["/home/user/.claude/CLAUDE.md", "/home/user/.codex/AGENTS.md"],
      skipped: [],
    });

    const result = await syncGlobal(
      { dryRun: false },
      {
        rulesSource: "/rules",
        global: ["global-rules/*.md"],
      },
    );

    expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
    const callArguments = vi.mocked(executionModule.executeActions).mock
      .calls[0];
    const actionsArgument: WriteAction[] = callArguments?.[0] ?? [];
    const paths = actionsArgument.map((action) => action.path);
    expect(paths.some((p) => p.endsWith("/.claude/CLAUDE.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/.codex/AGENTS.md"))).toBe(true);
    expect(
      actionsArgument.every(
        (action) => action.content === "# G1\nA\n\n# G2\nB",
      ),
    ).toBe(true);
    expect(result.written).toHaveLength(2);
  });

  describe("per-harness overrides", () => {
    it("composes shared global + per-harness override content", async () => {
      const sharedRules: Rule[] = [
        { path: "shared.md", content: "# Shared\nContent" },
      ];
      const overrideRules: Rule[] = [
        { path: "claude-extra.md", content: "# Claude Extra\nStuff" },
      ];

      // First call: loadRules for shared global
      // Second call: loadRules for claude override
      vi.mocked(filesystemModule.loadRules)
        .mockResolvedValueOnce({ rules: sharedRules, unmatchedPatterns: [] })
        .mockResolvedValueOnce({ rules: overrideRules, unmatchedPatterns: [] })
        .mockResolvedValue({ rules: [], unmatchedPatterns: [] });

      // No overlap
      vi.mocked(filesystemModule.globRulePaths)
        .mockResolvedValueOnce({ paths: ["shared.md"], unmatchedPatterns: [] })
        .mockResolvedValueOnce({
          paths: ["claude-extra.md"],
          unmatchedPatterns: [],
        });

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
        skipped: [],
      });

      await syncGlobal(
        { dryRun: false },
        {
          rulesSource: "/rules",
          global: ["shared/*.md"],
          globalOverrides: {
            claude: ["claude/*.md"],
          },
        },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
      const actionsArgument: WriteAction[] =
        vi.mocked(executionModule.executeActions).mock.calls[0]?.[0] ?? [];

      // Claude should have composed content (shared + override)
      const claudeAction = actionsArgument.find((a) =>
        a.path.endsWith("CLAUDE.md"),
      );
      expect(claudeAction).toBeDefined();
      expect(claudeAction?.content).toBe(
        "# Shared\nContent\n\n# Claude Extra\nStuff",
      );

      // Other harnesses should have only shared content
      const geminiAction = actionsArgument.find((a) =>
        a.path.includes("gemini"),
      );
      expect(geminiAction).toBeDefined();
      expect(geminiAction?.content).toBe("# Shared\nContent");
    });

    it("writes only to harnesses with override content when no global patterns", async () => {
      const overrideRules: Rule[] = [
        { path: "codex-only.md", content: "# Codex Only" },
      ];

      vi.mocked(filesystemModule.loadRules).mockResolvedValueOnce({
        rules: overrideRules,
        unmatchedPatterns: [],
      });

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
        skipped: [],
      });

      await syncGlobal(
        { dryRun: false },
        {
          rulesSource: "/rules",
          globalOverrides: {
            codex: ["codex/*.md"],
          },
        },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
      const actionsArgument: WriteAction[] =
        vi.mocked(executionModule.executeActions).mock.calls[0]?.[0] ?? [];

      // Only codex should have content
      expect(actionsArgument).toHaveLength(1);
      expect(actionsArgument[0]?.path).toMatch(/\.codex/u);
      expect(actionsArgument[0]?.content).toBe("# Codex Only");
    });

    it("throws on rule overlap between global and override for same harness", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: mockRules,
        unmatchedPatterns: [],
      });

      // Simulate overlap: same file in both global and claude override
      vi.mocked(filesystemModule.globRulePaths)
        .mockResolvedValueOnce({
          paths: ["shared.md", "overlap.md"],
          unmatchedPatterns: [],
        })
        .mockResolvedValueOnce({
          paths: ["overlap.md", "claude-only.md"],
          unmatchedPatterns: [],
        });

      await expect(
        syncGlobal(
          { dryRun: false },
          {
            rulesSource: "/rules",
            global: ["shared/*.md"],
            globalOverrides: {
              claude: ["claude/*.md"],
            },
          },
        ),
      ).rejects.toThrowError(/Rule overlap for harness "claude"/u);
    });

    it("allows same rule file across different harnesses", async () => {
      const sharedRules: Rule[] = [{ path: "shared.md", content: "# Shared" }];
      const overrideRules: Rule[] = [{ path: "extra.md", content: "# Extra" }];

      vi.mocked(filesystemModule.loadRules)
        .mockResolvedValueOnce({ rules: sharedRules, unmatchedPatterns: [] })
        .mockResolvedValueOnce({ rules: overrideRules, unmatchedPatterns: [] })
        .mockResolvedValueOnce({ rules: overrideRules, unmatchedPatterns: [] })
        .mockResolvedValue({ rules: [], unmatchedPatterns: [] });

      // Pre-glob shared paths once, then one overlap check per harness
      vi.mocked(filesystemModule.globRulePaths)
        .mockResolvedValueOnce({ paths: ["shared.md"], unmatchedPatterns: [] })
        .mockResolvedValueOnce({ paths: ["extra.md"], unmatchedPatterns: [] })
        .mockResolvedValueOnce({ paths: ["extra.md"], unmatchedPatterns: [] });

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
        skipped: [],
      });

      // Should not throw - same file in different harnesses is fine
      await syncGlobal(
        { dryRun: false },
        {
          rulesSource: "/rules",
          global: ["shared/*.md"],
          globalOverrides: {
            claude: ["extra/*.md"],
            gemini: ["extra/*.md"],
          },
        },
      );

      expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
    });

    it("reports unmatched override patterns", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: [],
        unmatchedPatterns: ["nonexistent/*.md"],
      });

      const result = await syncGlobal(
        { dryRun: false },
        {
          rulesSource: "/rules",
          globalOverrides: {
            claude: ["nonexistent/*.md"],
          },
        },
      );

      expect(result.unmatchedPatterns).toContainEqual(
        "globalOverrides.claude: nonexistent/*.md",
      );
    });

    it("skips harnesses with no content", async () => {
      vi.mocked(filesystemModule.loadRules).mockResolvedValue({
        rules: [],
        unmatchedPatterns: ["missing/*.md"],
      });

      vi.mocked(executionModule.executeActions).mockResolvedValue({
        written: [],
        skipped: [],
      });

      const result = await syncGlobal(
        { dryRun: false },
        {
          rulesSource: "/rules",
          global: ["missing/*.md"],
        },
      );

      // No writes when all rules are empty
      expect(result.written).toEqual([]);
    });
  });
});
