import { describe, it, expect } from "vitest";
import { claudeAdapter } from "../../src/adapters/claude.ts";
import type { AdapterInput } from "../../src/adapters/index.ts";
import { join } from "node:path";
import { homedir } from "node:os";

describe("Claude Adapter", () => {
  const projectPath = join(homedir(), "test-project");

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

  it("should end content with newline", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toMatch(/\n$/);
  });

  it("should transform memory-bank.md to memory-bank-claude.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "docs/memory-bank.md", content: "# Memory Bank\nContent" },
        { path: "other.md", content: "# Other\nContent" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // The content should remain the same, only the path transformation happens internally
    expect(content).toContain("# Memory Bank\nContent");
    expect(content).toContain("# Other\nContent");
  });

  it("should transform multiple memory-bank.md files", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "docs/memory-bank.md", content: "# Memory Bank 1" },
        { path: "guides/memory-bank.md", content: "# Memory Bank 2" },
        { path: "memory-bank.md", content: "# Memory Bank 3" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // All memory-bank.md files should have their content included
    expect(content).toContain("# Memory Bank 1");
    expect(content).toContain("# Memory Bank 2");
    expect(content).toContain("# Memory Bank 3");
  });

  it("should not transform files that don't end with memory-bank.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "memory-bank.txt", content: "Not transformed" },
        { path: "docs/memory-bank-old.md", content: "Not transformed either" },
        { path: "memory-bank.md.bak", content: "Also not transformed" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // These files should be included as-is
    expect(content).toContain("Not transformed");
    expect(content).toContain("Not transformed either");
    expect(content).toContain("Also not transformed");
  });
});
