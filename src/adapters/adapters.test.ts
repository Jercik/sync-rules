import { describe, it, expect } from "vitest";
import { adapterRegistry } from "./registry.js";
import type { AdapterInput } from "./adapters.js";
import { join } from "node:path";
import { homedir } from "node:os";

describe("Adapter Registry", () => {
  describe("adapterRegistry object", () => {
    // Representative tests for adapter registry (one from each meta type)
    const adapterTests = [
      { name: "claude", type: "single-file" },
      { name: "kilocode", type: "multi-file" },
    ] as const;

    for (const { name, type } of adapterTests) {
      it(`exposes '${name}' with ${type} metadata and a planner function`, () => {
        const adapterDef = adapterRegistry[name];
        expect(adapterDef).toBeDefined();
        expect(typeof adapterDef.planWrites).toBe("function");
        expect(adapterDef.meta.type).toBe(type);
      });
    }
  });
});

// Single-file adapter representative tests (using claude as example)
describe("Single-file Adapters", () => {
  const projectPath = join(homedir(), "test-project");

  describe("claude adapter", () => {
    const adapter = adapterRegistry.claude.planWrites;

    it("produces one consolidated file when rules are selected", () => {
      const input: AdapterInput = {
        projectPath,
        rules: [
          { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
          { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
        ],
      };

      const actions = adapter(input);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.path).toBe(join(projectPath, "CLAUDE.md"));
      expect(actions[0]?.content).toContain("# CLAUDE.md");
    });

    it("returns no actions when no rules are selected", () => {
      const input: AdapterInput = {
        projectPath,
        rules: [],
      };

      const actions = adapter(input);

      expect(actions).toHaveLength(0);
    });

    it("concatenates rules with '---' separators", () => {
      const input: AdapterInput = {
        projectPath,
        rules: [
          { path: "rule1.md", content: "# Rule 1\nFirst rule content" },
          { path: "rule2.md", content: "# Rule 2\nSecond rule content" },
          { path: "rule3.md", content: "# Rule 3\nThird rule content" },
        ],
      };

      const actions = adapter(input);
      const content = actions[0]?.content ?? "";

      expect(content).toContain("# Rule 1\nFirst rule content");
      expect(content).toContain("---");
      expect(content).toContain("# Rule 2\nSecond rule content");
      expect(content).toContain("---");
      expect(content).toContain("# Rule 3\nThird rule content");
      expect(content).toMatch(/# Rule 1.*---.*# Rule 2.*---.*# Rule 3/su);
    });
  });
});

describe("Multi-file Adapters", () => {
  const projectPath = join(homedir(), "test-project");

  // Test with kilocode as representative of multi-file adapters
  describe("kilocode adapter", () => {
    const rulesDir = join(projectPath, ".kilocode/rules");
    const adapter = adapterRegistry.kilocode.planWrites;

    it("materializes each rule under the adapter base directory", () => {
      const input: AdapterInput = {
        projectPath,
        rules: [
          { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
          { path: "dir1/rule2.md", content: "# Rule 2\nContent of rule 2" },
          {
            path: "dir2/subdir/rule3.md",
            content: "# Rule 3\nContent of rule 3",
          },
        ],
      };

      const actions = adapter(input);

      expect(actions).toHaveLength(3);
      expect(actions[0]).toEqual({
        path: join(rulesDir, "rule1.md"),
        content: "# Rule 1\nContent of rule 1",
      });
      expect(actions[1]).toEqual({
        path: join(rulesDir, "dir1/rule2.md"),
        content: "# Rule 2\nContent of rule 2",
      });
      expect(actions[2]).toEqual({
        path: join(rulesDir, "dir2/subdir/rule3.md"),
        content: "# Rule 3\nContent of rule 3",
      });
    });
  });
});
