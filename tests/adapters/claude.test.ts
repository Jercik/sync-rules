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

  it("should filter out files containing memory-bank in path", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "docs/memory-bank.md", content: "# Memory Bank\nContent" },
        { path: "other.md", content: "# Other\nContent" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // Memory bank files should be filtered out
    expect(content).not.toContain("# Memory Bank");
    expect(content).toContain("# Other\nContent");
  });

  it("should filter out multiple memory-bank files", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "docs/memory-bank.md", content: "# Memory Bank 1" },
        { path: "guides/memory-bank.md", content: "# Memory Bank 2" },
        { path: "memory-bank.md", content: "# Memory Bank 3" },
        { path: "regular-rule.md", content: "# Regular Rule" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // All memory-bank files should be filtered out
    expect(content).not.toContain("# Memory Bank 1");
    expect(content).not.toContain("# Memory Bank 2");
    expect(content).not.toContain("# Memory Bank 3");
    expect(content).toContain("# Regular Rule");
  });

  it("should filter any file with memory-bank in the path", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "memory-bank.txt", content: "Memory bank text" },
        { path: "docs/memory-bank-old.md", content: "Old memory bank" },
        { path: "memory-bank.md.bak", content: "Backup memory bank" },
        { path: "some-memory-bank-file.md", content: "Some memory bank" },
        { path: "normal-file.md", content: "Normal content" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    // All files with memory-bank in the path should be filtered out
    expect(content).not.toContain("Memory bank text");
    expect(content).not.toContain("Old memory bank");
    expect(content).not.toContain("Backup memory bank");
    expect(content).not.toContain("Some memory bank");
    expect(content).toContain("Normal content");
  });

  it("should show 'No rules configured' when all rules are memory-bank files", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "memory-bank.md", content: "# Memory Bank" },
        { path: "docs/memory-bank-claude.md", content: "# Memory Bank Claude" },
      ],
    };

    const actions = claudeAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("No rules configured.");
  });
});
