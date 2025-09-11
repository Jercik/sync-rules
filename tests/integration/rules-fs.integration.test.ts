import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { makeTempDir, cleanupDir } from "../_helpers/test-utils.js";
import {
  globRulePaths,
  readRuleContents,
  loadRules,
} from "../../src/core/rules-fs.js";

describe("filesystem operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  describe("globRulePaths", () => {
    beforeEach(async () => {
      await mkdir(join(tempDir, "frontend"), { recursive: true });
      await mkdir(join(tempDir, "backend"), { recursive: true });
      await mkdir(join(tempDir, "test"), { recursive: true });
      await mkdir(join(tempDir, "deep", "nested"), { recursive: true });

      await writeFile(join(tempDir, "python.md"), "# Python rules");
      await writeFile(join(tempDir, "javascript.md"), "# JS rules");
      await writeFile(join(tempDir, "frontend", "react.md"), "# React rules");
      await writeFile(join(tempDir, "frontend", "vue.md"), "# Vue rules");
      await writeFile(join(tempDir, "backend", "node.md"), "# Node rules");
      await writeFile(join(tempDir, "backend", "django.py"), "# Python file");
      await writeFile(join(tempDir, "test", "test-rule.md"), "# Test rule");
      await writeFile(
        join(tempDir, "deep", "nested", "deep.md"),
        "# Deep rule",
      );
      await writeFile(join(tempDir, "README.txt"), "Not markdown");
      await writeFile(join(tempDir, "config.json"), "{}");
    });

    it("returns sorted relative paths for '**/*.md' (POSIX slashes)", async () => {
      const patterns = ["**/*.md"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual([
        "backend/node.md",
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
        "test/test-rule.md",
      ]);
    });

    // Exact name matching covered by wildcard and exclusion tests

    it("supports negations: '**/*.md' minus '!test/**'", async () => {
      const patterns = ["**/*.md", "!test/**"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual([
        "backend/node.md",
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
      ]);
    });

    // Empty pattern test removed - config validation requires positive globs
  });

  describe("loadRules", () => {
    it("should glob and read matching files with negations", async () => {
      await mkdir(join(tempDir, "sub"), { recursive: true });
      await writeFile(join(tempDir, "a.md"), "# A");
      await writeFile(join(tempDir, "sub", "b.md"), "# B");
      await writeFile(join(tempDir, "sub", "c.txt"), "nope");

      const rules = await loadRules(tempDir, ["**/*.md", "!sub/**"]);
      expect(rules).toEqual([{ path: "a.md", content: "# A" }]);
    });
  });

  describe("readRuleContents", () => {
    beforeEach(async () => {
      await mkdir(join(tempDir, "rules"), { recursive: true });
      await writeFile(
        join(tempDir, "rules", "rule1.md"),
        "# Rule 1\nThis is rule 1 content.",
      );
      await writeFile(
        join(tempDir, "rules", "rule2.md"),
        "# Rule 2\nThis is rule 2 content.",
      );
      await mkdir(join(tempDir, "rules", "subdir"), { recursive: true });
      await writeFile(
        join(tempDir, "rules", "subdir", "rule3.md"),
        "# Rule 3\nThis is rule 3 content in subdir.",
      );
    });

    it("reads multiple files, including nested subpaths", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["rule1.md", "rule2.md", "subdir/rule3.md"];

      const results = await readRuleContents(rulesDir, relPaths);

      expect(results).toHaveLength(3);
      expect(results).toContainEqual({
        path: "rule1.md",
        content: "# Rule 1\nThis is rule 1 content.",
      });
      expect(results).toContainEqual({
        path: "rule2.md",
        content: "# Rule 2\nThis is rule 2 content.",
      });
      expect(results).toContainEqual({
        path: "subdir/rule3.md",
        content: "# Rule 3\nThis is rule 3 content in subdir.",
      });
    });

    it("propagates read errors with a helpful path in the message", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["rule1.md", "nonexistent.md", "rule2.md"];

      await expect(readRuleContents(rulesDir, relPaths)).rejects.toThrow(
        /Failed to read rule file.*nonexistent\.md/u,
      );
    });
  });
});
