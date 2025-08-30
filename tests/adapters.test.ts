import { describe, it, expect } from "vitest";
import { adapterRegistry } from "../src/adapters/registry.ts";
import type { AdapterInput } from "../src/adapters/adapters.ts";
import { join } from "node:path";
import { homedir } from "node:os";

describe("Adapter Registry", () => {
  describe("adapterRegistry object", () => {
    it("should return claude adapter when requested", () => {
      const adapterDef = adapterRegistry.claude;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.planWrites).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });

    it("should return gemini adapter when requested", () => {
      const adapterDef = adapterRegistry.gemini;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.planWrites).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });

    it("should return kilocode adapter when requested", () => {
      const adapterDef = adapterRegistry.kilocode;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.planWrites).toBe("function");
      expect(adapterDef.meta.type).toBe("multi-file");
    });

    it("should return cline adapter when requested", () => {
      const adapterDef = adapterRegistry.cline;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.planWrites).toBe("function");
      expect(adapterDef.meta.type).toBe("multi-file");
    });

    it("should return codex adapter when requested", () => {
      const adapterDef = adapterRegistry.codex;
      expect(adapterDef).toBeDefined();
      expect(typeof adapterDef.planWrites).toBe("function");
      expect(adapterDef.meta.type).toBe("single-file");
    });
  });
});

describe("Claude Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapterRegistry.claude.planWrites;

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

    const actions = adapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0].content).toContain("No rules configured.");
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
    const content = actions[0].content;

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
    const content = actions[0].content;

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
    const content = actions[0].content;

    expect(content).toContain("No rules configured.");
  });
});

describe("Gemini Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapterRegistry.gemini.planWrites;

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
    expect(actions[0].content).toContain("No rules configured.");
  });
});

describe("Codex Adapter", () => {
  const projectPath = join(homedir(), "test-project");
  const adapter = adapterRegistry.codex.planWrites;

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
  const adapter = adapterRegistry.cline.planWrites;

  it("should create write actions for each rule", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

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
  const adapter = adapterRegistry.kilocode.planWrites;

  it("should create write actions for each rule", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = adapter(input);

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
