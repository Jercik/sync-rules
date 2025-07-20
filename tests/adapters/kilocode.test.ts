import { describe, it, expect } from "vitest";
import { kilocodeAdapter } from "../../src/adapters/kilocode.ts";
import type { AdapterInput } from "../../src/adapters/index.ts";
import { join } from "node:path";
import { homedir } from "node:os";

describe("Kilocode Adapter", () => {
  const projectPath = join(homedir(), "test-project");
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

  it("should preserve directory structure", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "dir1/rule1.md", content: "Content 1" },
        { path: "dir2/subdir/rule2.md", content: "Content 2" },
        { path: "rule3.md", content: "Content 3" },
      ],
    };

    const actions = kilocodeAdapter(input);

    // 1 root mkdir + 3 subdirs + 3 writes = 7 actions
    expect(actions).toHaveLength(7);

    // Check mkdir actions
    expect(actions[0]).toEqual({
      type: "mkdir",
      path: rulesDir,
      recursive: true,
    });
    expect(actions[1]).toEqual({
      type: "mkdir",
      path: join(rulesDir, "dir1"),
      recursive: true,
    });
    expect(actions[2]).toEqual({
      type: "mkdir",
      path: join(rulesDir, "dir2"),
      recursive: true,
    });
    expect(actions[3]).toEqual({
      type: "mkdir",
      path: join(rulesDir, "dir2/subdir"),
      recursive: true,
    });

    // Check write actions
    expect(actions[4]).toEqual({
      type: "write",
      path: join(rulesDir, "dir1/rule1.md"),
      content: "Content 1",
    });
    expect(actions[5]).toEqual({
      type: "write",
      path: join(rulesDir, "dir2/subdir/rule2.md"),
      content: "Content 2",
    });
    expect(actions[6]).toEqual({
      type: "write",
      path: join(rulesDir, "rule3.md"),
      content: "Content 3",
    });
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

  it("should use .kilocode/rules directory", () => {
    const input: AdapterInput = {
      projectPath: join(homedir(), "custom-path"),
      rules: [{ path: "test.md", content: "Test" }],
    };

    const actions = kilocodeAdapter(input);

    expect(actions[0].path).toBe(
      join(homedir(), "custom-path", ".kilocode/rules"),
    );
    expect(actions[1].path).toBe(
      join(homedir(), "custom-path", ".kilocode/rules/test.md"),
    );
  });

  it("should handle name collisions by preserving directory structure", () => {
    const input: AdapterInput = {
      projectPath,
      rules: [
        { path: "frontend/react.md", content: "Frontend React rules" },
        { path: "backend/react.md", content: "Backend React rules" },
        { path: "devops/ansible.md", content: "DevOps Ansible rules" },
        { path: "frontend/ansible.md", content: "Frontend Ansible rules" },
      ],
    };

    const actions = kilocodeAdapter(input);

    // Should create necessary directories and preserve all files
    const writeActions = actions.filter((a) => a.type === "write");
    expect(writeActions).toHaveLength(4);

    // Check that all files are written with their full paths
    expect(writeActions[0]).toEqual({
      type: "write",
      path: join(rulesDir, "frontend/react.md"),
      content: "Frontend React rules",
    });
    expect(writeActions[1]).toEqual({
      type: "write",
      path: join(rulesDir, "backend/react.md"),
      content: "Backend React rules",
    });
    expect(writeActions[2]).toEqual({
      type: "write",
      path: join(rulesDir, "devops/ansible.md"),
      content: "DevOps Ansible rules",
    });
    expect(writeActions[3]).toEqual({
      type: "write",
      path: join(rulesDir, "frontend/ansible.md"),
      content: "Frontend Ansible rules",
    });
  });
});
