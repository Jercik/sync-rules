import { describe, it, expect } from "vitest";
import { geminiAdapter } from "../../src/adapters/gemini.ts";
import type { AdapterInput } from "../../src/adapters/index.ts";
import { join } from "node:path";
import { homedir } from "node:os";

describe("Gemini Adapter", () => {
  const projectPath = join(homedir(), "test-project");

  it("should create a single write action for GEMINI.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = geminiAdapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "write",
      path: join(projectPath, "GEMINI.md"),
      content: expect.stringContaining("# GEMINI.md - Rules for Gemini Code"),
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

    const actions = geminiAdapter(input);
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

    const actions = geminiAdapter(input);

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

    const actions = geminiAdapter(input);
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

    const actions = geminiAdapter(input);
    const content = actions[0].content;

    expect(content).toContain("# GEMINI.md - Rules for Gemini Code");
    expect(content).toContain(
      "To modify rules, edit the source `.md` files and run `sync-rules` to regenerate.",
    );
  });

  it("should end content with newline", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = geminiAdapter(input);
    const content = actions[0].content;

    expect(content).toMatch(/\n$/);
  });

  it("should output to GEMINI.md not CLAUDE.md", () => {
    const input: AdapterInput = {
      projectPath: join(homedir(), "different-path"),
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = geminiAdapter(input);

    expect(actions[0].path).toBe(
      join(homedir(), "different-path", "GEMINI.md"),
    );
    expect(actions[0].path).not.toContain("CLAUDE");
  });
});
