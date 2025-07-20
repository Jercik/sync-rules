import { describe, it, expect } from "vitest";
import { kilocodeAdapter } from "../../src/adapters/kilocode.ts";
import type { AdapterInput } from "../../src/adapters/index.ts";
import { join } from "node:path";

describe("Kilocode Adapter", () => {
  const projectPath = "/test/project";
  const rulesDir = join(projectPath, ".kilocode/rules");

  it("should create mkdir action and write actions for each rule", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "# Rule 1\nContent of rule 1" },
        { path: "rule2.md", content: "# Rule 2\nContent of rule 2" },
      ],
    };

    const actions = kilocodeAdapter(input);

    expect(actions).toHaveLength(3); // 1 mkdir + 2 writes
    expect(actions[0]).toEqual({
      type: "mkdir",
      path: rulesDir,
      recursive: true,
    });
    expect(actions[1]).toEqual({
      type: "write",
      path: join(rulesDir, "rule1.md"),
      content: "# Rule 1\nContent of rule 1",
    });
    expect(actions[2]).toEqual({
      type: "write",
      path: join(rulesDir, "rule2.md"),
      content: "# Rule 2\nContent of rule 2",
    });
  });

  it("should handle empty rules with just mkdir", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [],
    };

    const actions = kilocodeAdapter(input);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "mkdir",
      path: rulesDir,
      recursive: true,
    });
  });

  it("should flatten nested paths using basename", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "dir1/rule1.md", content: "Content 1" },
        { path: "dir2/subdir/rule2.md", content: "Content 2" },
        { path: "rule3.md", content: "Content 3" },
      ],
    };

    const actions = kilocodeAdapter(input);

    expect(actions).toHaveLength(4); // 1 mkdir + 3 writes
    expect(actions[1].path).toBe(join(rulesDir, "rule1.md"));
    expect(actions[2].path).toBe(join(rulesDir, "rule2.md"));
    expect(actions[3].path).toBe(join(rulesDir, "rule3.md"));
    // Should not include directory structure
    expect(actions[1].path).not.toContain("dir1");
    expect(actions[2].path).not.toContain("dir2");
    expect(actions[2].path).not.toContain("subdir");
  });

  it("should preserve original content without modification", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "rule1.md", content: "  Content with whitespace  \n\n" },
        { path: "rule2.md", content: "Content\nwith\nnewlines" },
      ],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[1].content).toBe("  Content with whitespace  \n\n");
    expect(actions[2].content).toBe("Content\nwith\nnewlines");
  });

  it("should handle large number of rules", () => {
    const rules = Array.from({ length: 100 }, (_, i) => ({
      path: `rule${i}.md`,
      content: `Content of rule ${i}`,
    }));

    const input: AdapterInput = {
      projectPath,
      rules,
    };

    const actions = kilocodeAdapter(input);

    expect(actions).toHaveLength(101); // 1 mkdir + 100 writes
    expect(actions[0].type).toBe("mkdir");
    for (let i = 1; i <= 100; i++) {
      expect(actions[i].type).toBe("write");
      expect(actions[i].path).toBe(join(rulesDir, `rule${i - 1}.md`));
      expect(actions[i].content).toBe(`Content of rule ${i - 1}`);
    }
  });

  it("should handle files with same basename", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "dir1/same.md", content: "Content 1" },
        { path: "dir2/same.md", content: "Content 2" },
      ],
    };

    const actions = kilocodeAdapter(input);

    // Both will write to same.md, second one will overwrite
    expect(actions).toHaveLength(3); // 1 mkdir + 2 writes
    expect(actions[1].path).toBe(join(rulesDir, "same.md"));
    expect(actions[2].path).toBe(join(rulesDir, "same.md"));
    expect(actions[1].content).toBe("Content 1");
    expect(actions[2].content).toBe("Content 2");
  });

  it("should use .kilocode/rules directory", () => {
    const input: AdapterInput = {
      projectPath: "/custom/path",
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[0].path).toBe("/custom/path/.kilocode/rules");
    expect(actions[1].path).toBe("/custom/path/.kilocode/rules/test.md");
  });

  it("should handle special characters in filenames", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "file-with-dashes.md", content: "Content 1" },
        { path: "file_with_underscores.md", content: "Content 2" },
        { path: "file.with.dots.md", content: "Content 3" },
      ],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[1].path).toBe(join(rulesDir, "file-with-dashes.md"));
    expect(actions[2].path).toBe(join(rulesDir, "file_with_underscores.md"));
    expect(actions[3].path).toBe(join(rulesDir, "file.with.dots.md"));
  });

  it("should create recursive directory", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[0]).toMatchObject({
      type: "mkdir",
      recursive: true,
    });
  });

  it("should handle empty content", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "empty.md", content: "" },
        { path: "nonempty.md", content: "Content" },
      ],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[1].content).toBe("");
    expect(actions[2].content).toBe("Content");
  });
});
