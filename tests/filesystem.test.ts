import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  globRulePaths,
  filterValidMdPaths,
  readRuleContents,
} from "../src/filesystem.ts";

describe("filesystem operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory within current working directory (allowed by path validation)
    tempDir = await mkdtemp(join(process.cwd(), "temp-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("globRulePaths", () => {
    beforeEach(async () => {
      // Create test file structure
      await mkdir(join(tempDir, "frontend"), { recursive: true });
      await mkdir(join(tempDir, "backend"), { recursive: true });
      await mkdir(join(tempDir, "test"), { recursive: true });
      await mkdir(join(tempDir, "deep", "nested"), { recursive: true });

      // Create test files
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

    it("should default to all markdown files when only negative patterns", async () => {
      const patterns = ["!test/**"];
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

    it("should handle empty patterns", async () => {
      const patterns: string[] = [];
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

  describe("filterValidMdPaths", () => {
    beforeEach(async () => {
      await mkdir(join(tempDir, "subdir"), { recursive: true });

      // Create valid markdown files
      await writeFile(join(tempDir, "valid.md"), "# Valid markdown");
      await writeFile(join(tempDir, "subdir", "nested.md"), "# Nested valid");

      // Create invalid files
      await writeFile(join(tempDir, "large.md"), "x".repeat(1024 * 1024 + 1)); // >1MB
      await writeFile(join(tempDir, "not-markdown.txt"), "Not markdown");
      await writeFile(join(tempDir, "no-extension"), "No extension");
      await writeFile(join(tempDir, "wrong.MD"), "Wrong case extension");
    });

    it("should filter to only valid markdown files", async () => {
      const paths = [
        "valid.md",
        "subdir/nested.md",
        "large.md",
        "not-markdown.txt",
        "no-extension",
        "wrong.MD",
      ];
      const result = await filterValidMdPaths(tempDir, paths);

      expect(result).toEqual(["valid.md", "subdir/nested.md", "wrong.MD"]);
    });

    it("should handle empty paths array", async () => {
      const result = await filterValidMdPaths(tempDir, []);

      expect(result).toEqual([]);
    });

    it("should skip non-existent files", async () => {
      const paths = ["valid.md", "does-not-exist.md", "subdir/nested.md"];
      const result = await filterValidMdPaths(tempDir, paths);

      expect(result).toEqual(["valid.md", "subdir/nested.md"]);
    });

    it("should handle paths with no valid files", async () => {
      const paths = ["not-markdown.txt", "no-extension"];
      const result = await filterValidMdPaths(tempDir, paths);

      expect(result).toEqual([]);
    });

    it("should handle files that are exactly 1MB", async () => {
      // Create file exactly 1MB (should be invalid - MAX_MD_SIZE uses >=)
      await writeFile(join(tempDir, "exactly-1mb.md"), "x".repeat(1024 * 1024));

      const paths = ["exactly-1mb.md"];
      const result = await filterValidMdPaths(tempDir, paths);

      expect(result).toEqual([]); // File exactly 1MB is rejected
    });

    it("should handle mixed case extensions", async () => {
      await writeFile(join(tempDir, "mixed.Md"), "Mixed case");
      await writeFile(join(tempDir, "upper.MD"), "Upper case");

      const paths = ["mixed.Md", "upper.MD"];
      const result = await filterValidMdPaths(tempDir, paths);

      expect(result).toEqual(["mixed.Md", "upper.MD"]);
    });
  });

  describe("integration tests", () => {
    beforeEach(async () => {
      // Create comprehensive test structure
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

    it("should combine globbing and filtering correctly", async () => {
      const rulesDir = join(tempDir, "rules");
      const patterns = ["**/*.md", "!test/**"];

      // First glob for matching paths
      const globResults = await globRulePaths(rulesDir, patterns);
      expect(globResults).toEqual([
        "backend/node.md",
        "frontend/react.md",
        "large.md",
        "python.md",
      ]);

      // Then filter for valid markdown files
      const validResults = await filterValidMdPaths(rulesDir, globResults);
      expect(validResults).toEqual([
        "backend/node.md",
        "frontend/react.md",
        "python.md",
      ]);
    });

    it("should handle complex patterns with size filtering", async () => {
      const rulesDir = join(tempDir, "rules");
      const patterns = ["frontend/**", "python.md", "!**/*.json"];

      const globResults = await globRulePaths(rulesDir, patterns);
      const validResults = await filterValidMdPaths(rulesDir, globResults);

      expect(validResults).toEqual(["frontend/react.md", "python.md"]);
    });
  });

  describe("readRuleContents", () => {
    beforeEach(async () => {
      // Create test files with content
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

    it("should skip non-existent files and log error", async () => {
      const rulesDir = join(tempDir, "rules");
      const relPaths = ["rule1.md", "nonexistent.md", "rule2.md"];

      // Mock console.error to check if it's called
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

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

      // Check that error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read file"),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
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
