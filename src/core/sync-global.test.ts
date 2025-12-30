import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncGlobal } from "./sync-global.js";
import * as filesystemModule from "./rules-fs.js";
import * as executionModule from "./execution.js";
import type { Rule } from "./rules-fs.js";
import type { WriteAction } from "./execution.js";

vi.mock("./rules-fs.js", () => ({
  loadRules: vi.fn(),
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
    vi.clearAllMocks();
  });

  it("returns no writes when no global patterns configured", async () => {
    const result = await syncGlobal(
      { dryRun: false },
      {
        rulesSource: "/rules",
        projects: [],
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
        projects: [],
      },
    );
    expect(filesystemModule.loadRules).toHaveBeenCalled();
    expect(result.written).toEqual([]);
    expect(result.unmatchedPatterns).toEqual(["global-rules/*.md"]);
  });

  it("writes combined content to all global targets", async () => {
    // Mock rules
    vi.mocked(filesystemModule.loadRules).mockResolvedValue({
      rules: mockRules,
      unmatchedPatterns: [],
    });

    // Mock executeActions
    vi.mocked(executionModule.executeActions).mockResolvedValue({
      written: ["/home/user/.claude/CLAUDE.md", "/home/user/.codex/AGENTS.md"],
      skipped: [],
    });

    const result = await syncGlobal(
      { dryRun: false },
      {
        rulesSource: "/rules",
        global: ["global-rules/*.md"],
        projects: [],
      },
    );

    expect(executionModule.executeActions).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(executionModule.executeActions).mock.calls[0];
    const actionsArg: WriteAction[] = callArgs?.[0] ?? [];
    const paths = actionsArg.map((action) => action.path);
    expect(paths.some((p) => p.endsWith("/.claude/CLAUDE.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/.codex/AGENTS.md"))).toBe(true);
    expect(result.written.length).toBe(2);
  });
});
