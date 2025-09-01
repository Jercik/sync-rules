import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { makeTempDir, cleanupDir } from "../_helpers/test-utils";
import { globRulePaths, readRuleContents } from "../../src/core/rules-fs.js";

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

    it("should find all markdown files with wildcard pattern", async () => {
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

    it("should find specific files by exact name", async () => {
      const patterns = ["python.md", "javascript.md"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual(["javascript.md", "python.md"]);
    });

    it("should find files in specific directories", async () => {
      const patterns = ["frontend/*.md"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual(["frontend/react.md", "frontend/vue.md"]);
    });

    it("should exclude files with negative patterns", async () => {
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

    it("should handle multiple exclusions", async () => {
      const patterns = ["**/*.md", "!test/**", "!backend/**"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual([
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
      ]);
    });

    it("should return empty array when only negative patterns", async () => {
      const patterns = ["!test/**"];
      const result = await globRulePaths(tempDir, patterns);

      // Users must be explicit: to exclude test files, use ["**/*.md", "!test/**"]
      expect(result).toEqual([]);
    });

    it("should return empty array when no patterns provided", async () => {
      const patterns: string[] = [];
      const result = await globRulePaths(tempDir, patterns);

      // No patterns means no files selected
      expect(result).toEqual([]);
    });

    it("should handle non-existent directory gracefully", async () => {
      const nonExistentDir = join(tempDir, "does-not-exist");
      const patterns = ["**/*.md"];

      // Node.js fs.glob returns empty array for non-existent directories
      const result = await globRulePaths(nonExistentDir, patterns);
      expect(result).toEqual([]);
    });

    it("should return empty array when no files match", async () => {
      const patterns = ["*.xyz"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual([]);
    });

    it("should handle complex nested exclusions", async () => {
      const patterns = ["**/*.md", "!**/nested/**"];
      const result = await globRulePaths(tempDir, patterns);

      expect(result).toEqual([
        "backend/node.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
        "test/test-rule.md",
      ]);
    });
  });

  describe("integration tests", () => {
    beforeEach(async () => {
      await mkdir(join(tempDir, "rules", "frontend"), { recursive: true });
      await mkdir(join(tempDir, "rules", "backend"), { recursive: true });
      await mkdir(join(tempDir, "rules", "test"), { recursive: true });

      // Valid markdown files
      await writeFile(join(tempDir, "rules", "python.md"), "# Python");
      await writeFile(
        join(tempDir, "rules", "frontend", "react.md"),
        "# React",
      );
      await writeFile(join(tempDir, "rules", "backend", "node.md"), "# Node");

      // Invalid files
      await writeFile(
        join(tempDir, "rules", "large.md"),
        "x".repeat(1024 * 1024 + 1),
      );
      await writeFile(join(tempDir, "rules", "test", "test.md"), "# Test");
      await writeFile(join(tempDir, "rules", "config.json"), "{}");
    });

    it("should glob paths correctly with case-sensitive matching", async () => {
      const rulesDir = join(tempDir, "rules");
      const patterns = ["**/*.md", "!test/**"];

      // Glob patterns are case-sensitive (e.g., *.md won't match .MD files)
      const globResults = await globRulePaths(rulesDir, patterns);
      expect(globResults).toEqual([
        "backend/node.md",
        "frontend/react.md",
        "large.md",
        "python.md",
      ]);
    });

    it("should handle complex patterns correctly", async () => {
      const rulesDir = join(tempDir, "rules");
      const patterns = ["frontend/**", "python.md", "!**/*.json"];

      const globResults = await globRulePaths(rulesDir, patterns);

      expect(globResults).toEqual(["frontend/react.md", "python.md"]);
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

    it("should read contents of multiple files", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["rule1.md", "rule2.md"];

      const results = await readRuleContents(rulesDir, relPaths);

      expect(results).toHaveLength(2);
      expect(results).toContainEqual({
        path: "rule1.md",
        content: "# Rule 1\nThis is rule 1 content.",
      });
      expect(results).toContainEqual({
        path: "rule2.md",
        content: "# Rule 2\nThis is rule 2 content.",
      });
    });

    it("should handle nested paths", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["subdir/rule3.md"];

      const results = await readRuleContents(rulesDir, relPaths);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        path: "subdir/rule3.md",
        content: "# Rule 3\nThis is rule 3 content in subdir.",
      });
    });

    it("should handle empty file list", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths: string[] = [];

      const results = await readRuleContents(rulesDir, relPaths);

      expect(results).toEqual([]);
    });

    it("should throw error when file cannot be read", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["rule1.md", "nonexistent.md", "rule2.md"];

      // Expect the function to throw an error
      await expect(readRuleContents(rulesDir, relPaths)).rejects.toThrow(
        /Failed to read rule file.*nonexistent\.md/,
      );
    });

    it("should handle UTF-8 content correctly", async () => {
      const rulesDir = join(tempDir, "rules");
      await writeFile(
        join(rulesDir, "unicode.md"),
        "# Unicode Test\n🚀 Emoji and special chars: äöü ñ 中文",
      );

      const results = await readRuleContents(rulesDir, ["unicode.md"]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        path: "unicode.md",
        content: "# Unicode Test\n🚀 Emoji and special chars: äöü ñ 中文",
      });
    });

    it("should preserve file content exactly", async () => {
      const rulesDir = join(tempDir, "rules");
      const contentWithWhitespace =
        "  Line with spaces  \n\n\nMultiple newlines\n";
      await writeFile(join(rulesDir, "whitespace.md"), contentWithWhitespace);

      const results = await readRuleContents(rulesDir, ["whitespace.md"]);

      expect(results[0].content).toBe(contentWithWhitespace);
    });
  });
});
