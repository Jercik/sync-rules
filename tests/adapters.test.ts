import { describe, it, expect } from "vitest";
import { adapters } from "../src/adapters/adapters.ts";
import type { AdapterInput } from "../src/adapters/adapters.ts";
import type { WriteAction } from "../src/utils/content.ts";
import { join } from "node:path";
import { homedir } from "node:os";

type WriteAction = Extract<WriteAction, { type: "write" }>;

describe("Adapter Registry", () => {
  describe("adapters object", () => {
    it("should return claude adapter when requested", () => {
      const adapterDef = adapters.claude;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.generateActions).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });

    it("should return gemini adapter when requested", () => {
      const adapterDef = adapters.gemini;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.generateActions).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });

    it("should return kilocode adapter when requested", () => {
      const adapterDef = adapters.kilocode;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.generateActions).toBe("function");
      expect(adapterDef.meta.type).toBe("multi-file");
    });

    it("should return cline adapter when requested", () => {
      const adapterDef = adapters.cline;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.generateActions).toBe("function");
      expect(adapterDef.meta.type).toBe("multi-file");
    });

    it("should return codex adapter when requested", () => {
      const adapterDef = adapters.codex;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.generateActions).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });

    it("should not have unknown adapter", () => {
      expect(adapters["unknown" as Adapter]).toBeUndefined();
    });

    it("should only contain known adapters", () => {
      const knownAdapters = ["claude", "gemini", "kilocode", "cline", "codex"];
      expect(Object.keys(adapters).sort()).toEqual(knownAdapters.sort());
    });

    it("should contain all five adapters", () => {
      expect(Object.keys(adapters).length).toBe(5);
      expect("claude" in adapters).toBe(true);
      expect("gemini" in adapters).toBe(true);
      expect("kilocode" in adapters).toBe(true);
      expect("cline" in adapters).toBe(true);
      expect("codex" in adapters).toBe(true);
    });

    it("should have correct adapter definitions", () => {
      expect(adapters.claude.generateActions).toBeDefined();
      expect(adapters.gemini.generateActions).toBeDefined();
      expect(adapters.kilocode.generateActions).toBeDefined();
      expect(adapters.cline.generateActions).toBeDefined();
      expect(adapters.codex.generateActions).toBeDefined();
    });

    it("should be a plain object", () => {
      expect(adapters).toBeTypeOf("object");
      expect(adapters).not.toBeInstanceOf(Map);
    });
  });
});

describe("Claude Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapters.claude.generateActions;

  it("should create a single write action for CLAUDE.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
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

    const actions = adapter(input);
    const content = (actions[0] as WriteAction).content;

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

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect((actions[0] as WriteAction).content).toContain(
      "No rules configured.",
    );
  });

  it("should filter out files containing memory-bank in path", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "docs/memory-bank.md", content: "# Memory Bank\nContent" },
        { path: "other.md", content: "# Other\nContent" },
      ],
    };

    const actions = adapter(input);
    const content = (actions[0] as WriteAction).content;

    // Memory bank files should be filtered out
    expect(content).not.toContain("# Memory Bank");
    expect(content).toContain("# Other\nContent");
  });

  it("should filter out files containing self-reflection in path", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        {
          path: "ai-coding-workflow/self-reflection.md",
          content: "# Self Reflection\nContent",
        },
        { path: "other.md", content: "# Other\nContent" },
      ],
    };

    const actions = adapter(input);
    const content = (actions[0] as WriteAction).content;

    // Self-reflection files should be filtered out
    expect(content).not.toContain("# Self Reflection");
    expect(content).toContain("# Other\nContent");
  });

  it("should show 'No rules configured' when all rules are filtered out", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "memory-bank.md", content: "# Memory Bank" },
        { path: "self-reflection.md", content: "# Self Reflection" },
      ],
    };

    const actions = adapter(input);
    const content = (actions[0] as WriteAction).content;

    expect(content).toContain("No rules configured.");
  });
});

describe("Gemini Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapters.gemini.generateActions;

  it("should create a single write action for GEMINI.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      path: join(projectPath, "GEMINI.md"),
      content: expect.stringContaining("# GEMINI.md - Rules for Gemini Code"),
    });
  });

  it("should handle empty rules array", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect((actions[0] as WriteAction).content).toContain(
      "No rules configured.",
    );
  });
});

describe("Codex Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapters.codex.generateActions;

  it("should create a single write action for AGENTS.md", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      path: join(projectPath, "AGENTS.md"),
      content: expect.stringContaining(
        "# AGENTS.md - Project docs for Codex CLI",
      ),
    });
  });
});

describe("Cline Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const rulesDir = join(projectPath, ".clinerules");
  const adapter = adapters.cline.generateActions;

  it("should create write actions for each rule", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(2); // 2 writes, no mkdir needed (fs-extra handles it)
    expect(actions[0]).toEqual({
      path: join(rulesDir, "rule1.md"),
      content: "# Rule 1\nContent of rule 1",
    });
    expect(actions[1]).toEqual({
      path: join(rulesDir, "rule2.md"),
      content: "# Rule 2\nContent of rule 2",
    });
  });

  it("should handle empty rules with no actions", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(0); // No actions needed for empty rules
  });

  it("should preserve directory structure", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "dir1/rule1.md", content: "Content 1" },
        { path: "dir2/subdir/rule2.md", content: "Content 2" },
        { path: "rule3.md", content: "Content 3" },
      ],
    };

    const actions = adapter(input);

    // Just 3 writes, fs-extra handles directory creation
    expect(actions).toHaveLength(3);

    // Check write actions
    expect(actions[0]).toEqual({
      path: join(rulesDir, "dir1/rule1.md"),
      content: "Content 1",
    });
    expect(actions[1]).toEqual({
      path: join(rulesDir, "dir2/subdir/rule2.md"),
      content: "Content 2",
    });
    expect(actions[2]).toEqual({
      path: join(rulesDir, "rule3.md"),
      content: "Content 3",
    });
  });
});

describe("Kilocode Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const rulesDir = join(projectPath, ".kilocode/rules");
  const adapter = adapters.kilocode.generateActions;

  it("should create write actions for each rule", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

    // Just writes, fs-extra handles directory creation
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      path: join(rulesDir, "rule1.md"),
      content: "# Rule 1\nContent of rule 1",
    });
    expect(actions[1]).toEqual({
      path: join(rulesDir, "rule2.md"),
      content: "# Rule 2\nContent of rule 2",
    });
  });

  it("should handle empty rules with no actions", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [],
    };

    const actions = adapter(input);

    expect(actions).toHaveLength(0); // No actions needed for empty rules
  });
});
