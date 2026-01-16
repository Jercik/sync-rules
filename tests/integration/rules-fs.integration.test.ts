import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  makeTemporaryDirectory,
  cleanupDirectory,
} from "../_helpers/test-utilities.js";
import {
  globRulePaths,
  readRuleContents,
  loadRules,
} from "../../src/core/rules-fs.js";

describe("filesystem operations", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await makeTemporaryDirectory();
  });

  afterEach(async () => {
    await cleanupDirectory(temporaryDirectory);
  });

  describe("globRulePaths", () => {
    beforeEach(async () => {
      await mkdir(path.join(temporaryDirectory, "frontend"), {
        recursive: true,
      });
      await mkdir(path.join(temporaryDirectory, "backend"), {
        recursive: true,
      });
      await mkdir(path.join(temporaryDirectory, "test"), { recursive: true });
      await mkdir(path.join(temporaryDirectory, "deep", "nested"), {
        recursive: true,
      });

      await writeFile(
        path.join(temporaryDirectory, "python.md"),
        "# Python rules",
      );
      await writeFile(
        path.join(temporaryDirectory, "javascript.md"),
        "# JS rules",
      );
      await writeFile(
        path.join(temporaryDirectory, "frontend", "react.md"),
        "# React rules",
      );
      await writeFile(
        path.join(temporaryDirectory, "frontend", "vue.md"),
        "# Vue rules",
      );
      await writeFile(
        path.join(temporaryDirectory, "backend", "node.md"),
        "# Node rules",
      );
      await writeFile(
        path.join(temporaryDirectory, "backend", "django.py"),
        "# Python file",
      );
      await writeFile(
        path.join(temporaryDirectory, "test", "test-rule.md"),
        "# Test rule",
      );
      await writeFile(
        path.join(temporaryDirectory, "deep", "nested", "deep.md"),
        "# Deep rule",
      );
      await writeFile(
        path.join(temporaryDirectory, "README.txt"),
        "Not markdown",
      );
      await writeFile(path.join(temporaryDirectory, "config.json"), "{}");
    });

    it("returns sorted relative paths for '**/*.md' (POSIX slashes)", async () => {
      const patterns = ["**/*.md"];
      const result = await globRulePaths(temporaryDirectory, patterns);

      expect(result.paths).toEqual([
        "backend/node.md",
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
        "test/test-rule.md",
      ]);
      expect(result.unmatchedPatterns).toEqual([]);
    });

    // Exact name matching covered by wildcard and exclusion tests

    it("supports negations: '**/*.md' minus '!test/**'", async () => {
      const patterns = ["**/*.md", "!test/**"];
      const result = await globRulePaths(temporaryDirectory, patterns);

      expect(result.paths).toEqual([
        "backend/node.md",
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
      ]);
      expect(result.unmatchedPatterns).toEqual([]);
    });

    it("reports unmatched patterns", async () => {
      const patterns = ["**/*.md", "nonexistent/*.md", "also-missing/**"];
      const result = await globRulePaths(temporaryDirectory, patterns);

      // Should still return matches from the first pattern
      expect(result.paths).toEqual([
        "backend/node.md",
        "deep/nested/deep.md",
        "frontend/react.md",
        "frontend/vue.md",
        "javascript.md",
        "python.md",
        "test/test-rule.md",
      ]);
      // Should report the patterns that matched nothing
      expect(result.unmatchedPatterns).toEqual([
        "also-missing/**",
        "nonexistent/*.md",
      ]);
    });

    // Empty pattern test removed - config validation requires positive globs
  });

  describe("loadRules", () => {
    it("should glob and read matching files with negations", async () => {
      await mkdir(path.join(temporaryDirectory, "sub"), { recursive: true });
      await writeFile(path.join(temporaryDirectory, "a.md"), "# A");
      await writeFile(path.join(temporaryDirectory, "sub", "b.md"), "# B");
      await writeFile(path.join(temporaryDirectory, "sub", "c.txt"), "nope");

      const result = await loadRules(temporaryDirectory, [
        "**/*.md",
        "!sub/**",
      ]);
      expect(result.rules).toEqual([{ path: "a.md", content: "# A" }]);
      expect(result.unmatchedPatterns).toEqual([]);
    });
  });

  describe("readRuleContents", () => {
    beforeEach(async () => {
      await mkdir(path.join(temporaryDirectory, "rules"), { recursive: true });
      await writeFile(
        path.join(temporaryDirectory, "rules", "rule1.md"),
        "# Rule 1\nThis is rule 1 content.",
      );
      await writeFile(
        path.join(temporaryDirectory, "rules", "rule2.md"),
        "# Rule 2\nThis is rule 2 content.",
      );
      await mkdir(path.join(temporaryDirectory, "rules", "subdir"), {
        recursive: true,
      });
      await writeFile(
        path.join(temporaryDirectory, "rules", "subdir", "rule3.md"),
        "# Rule 3\nThis is rule 3 content in subdir.",
      );
    });

    it("reads multiple files, including nested subpaths", async () => {
      const rulesDirectory = path.join(temporaryDirectory, "rules");
      const relativePaths = ["rule1.md", "rule2.md", "subdir/rule3.md"];

      const results = await readRuleContents(rulesDirectory, relativePaths);

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
      const rulesDirectory = path.join(temporaryDirectory, "rules");
      const relativePaths = ["rule1.md", "nonexistent.md", "rule2.md"];

      await expect(
        readRuleContents(rulesDirectory, relativePaths),
      ).rejects.toThrowError(/Failed to read rule file.*nonexistent\.md/u);
    });
  });
});
