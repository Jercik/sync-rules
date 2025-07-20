import { describe, it, expect } from "vitest";
import { claudeAdapter } from "../../src/adapters/claude.ts";
import type { AdapterInput } from "../../src/adapters/index.ts";
import { join } from "node:path";

describe("Claude Adapter", () => {
  const projectPath = "/test/project";

  it("should create a single write action for CLAUDE.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = claudeAdapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "write",
      path: join(projectPath, "CLAUDE.md"),
      content: expect.stringContaining("# CLAUDE.md - Rules for Claude Code"),
    });
  });

  it("should concatenate multiple rules with separators", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nFirst rule content" },
        { path: "rule2.md", content: "# Rule 2\nSecond rule content" },
        { path: "rule3.md", content: "# Rule 3\nThird rule content" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("# Rule 1\nFirst rule content");
    expect(content).toContain("---");
    expect(content).toContain("# Rule 2\nSecond rule content");
    expect(content).toContain("---");
    expect(content).toContain("# Rule 3\nThird rule content");
    expect(content).toMatch(/# Rule 1.*---.*# Rule 2.*---.*# Rule 3/s);
  });

  it("should handle empty rules array", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [],
    };

    const actions = claudeAdapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0].content).toContain("No rules configured.");
  });

  it("should handle single rule without extra separators", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "only.md", content: "# Only Rule\nSingle rule content" }],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("# Only Rule\nSingle rule content");
    expect(content).not.toMatch(/---.*---/); // Should not have multiple separators
  });

  it("should trim whitespace from rule contents", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "\n\n# Rule 1\nContent\n\n" },
        { path: "rule2.md", content: "  # Rule 2\nContent  " },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("# Rule 1\nContent");
    expect(content).toContain("# Rule 2\nContent");
    // The header ends with \n\n, so \n\n# Rule 1 is expected
    expect(content).toContain(
      "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.\n\n# Rule 1",
    );
    expect(content).not.toContain("  # Rule 2"); // Leading spaces should be trimmed
  });

  it("should include header and instructions", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "test.md", content: "Test content" }],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("# CLAUDE.md - Rules for Claude Code");
    expect(content).toContain(
      "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.",
    );
  });

  it("should handle large content", () => {
    const largeContent = "A".repeat(100000);
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "large1.md", content: largeContent },
        { path: "large2.md", content: largeContent },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content.length).toBeGreaterThan(200000);
    expect(content).toContain(largeContent);
  });

  it("should preserve rule order", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "a.md", content: "Rule A" },
        { path: "z.md", content: "Rule Z" },
        { path: "m.md", content: "Rule M" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    const indexA = content.indexOf("Rule A");
    const indexZ = content.indexOf("Rule Z");
    const indexM = content.indexOf("Rule M");

    expect(indexA).toBeLessThan(indexZ);
    expect(indexZ).toBeLessThan(indexM);
  });

  it("should handle rules with existing separators", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\n---\nContent with separator" },
        { path: "rule2.md", content: "# Rule 2" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // Should still work correctly even if rules contain ---
    expect(content).toContain("# Rule 1\n---\nContent with separator");
    expect(content).toContain("# Rule 2");
  });

  it("should end content with newline", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toMatch(/\n$/);
  });
});
