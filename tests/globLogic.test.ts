import { describe, expect, it } from "vitest";
import { separatePatterns, filterUniquePaths } from "../src/globLogic.ts";

describe("separatePatterns", () => {
  it("should separate positive and negative patterns correctly", () => {
    const patterns = ["python.md", "frontend/**", "!test/**", "!*.tmp"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["python.md", "frontend/**"]);
    expect(result.negative).toEqual(["test/**", "*.tmp"]);
  });

  it("should handle empty patterns array", () => {
    const result = separatePatterns([]);

    expect(result.positive).toEqual(["**/*.md"]);
    expect(result.negative).toEqual([]);
  });

  it("should default to all markdown files when no positive patterns", () => {
    const patterns = ["!test/**", "!*.tmp"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["**/*.md"]);
    expect(result.negative).toEqual(["test/**", "*.tmp"]);
  });

  it("should handle patterns with only positive patterns", () => {
    const patterns = ["python.md", "frontend/**", "backend/*.js"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual([
      "python.md",
      "frontend/**",
      "backend/*.js",
    ]);
    expect(result.negative).toEqual([]);
  });

  it("should handle patterns with only negative patterns", () => {
    const patterns = ["!test/**", "!node_modules/**", "!*.log"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["**/*.md"]);
    expect(result.negative).toEqual(["test/**", "node_modules/**", "*.log"]);
  });

  it("should handle single positive pattern", () => {
    const patterns = ["*.md"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["*.md"]);
    expect(result.negative).toEqual([]);
  });

  it("should handle single negative pattern", () => {
    const patterns = ["!*.tmp"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["**/*.md"]);
    expect(result.negative).toEqual(["*.tmp"]);
  });

  it("should handle patterns with exclamation marks not at the start", () => {
    const patterns = ["path!with!exclamations.md", "!actually-negative.md"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["path!with!exclamations.md"]);
    expect(result.negative).toEqual(["actually-negative.md"]);
  });

  it("should filter out empty patterns", () => {
    const patterns = ["", "valid.md", "!", "  ", "!test/**"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["valid.md"]);
    expect(result.negative).toEqual(["test/**"]);
  });

  it("should preserve pattern order", () => {
    const patterns = ["z.md", "a.md", "!z.tmp", "!a.tmp"];
    const result = separatePatterns(patterns);

    expect(result.positive).toEqual(["z.md", "a.md"]);
    expect(result.negative).toEqual(["z.tmp", "a.tmp"]);
  });
});

describe("filterUniquePaths", () => {
  it("should remove duplicates and sort paths", () => {
    const paths = ["c.md", "a.md", "b.md", "a.md", "c.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("should handle empty array", () => {
    const result = filterUniquePaths([]);

    expect(result).toEqual([]);
  });

  it("should handle array with no duplicates", () => {
    const paths = ["a.md", "b.md", "c.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("should handle array with all duplicates", () => {
    const paths = ["same.md", "same.md", "same.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual(["same.md"]);
  });

  it("should sort paths with different depths", () => {
    const paths = ["deep/nested/file.md", "shallow.md", "deep/file.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual([
      "deep/file.md",
      "deep/nested/file.md",
      "shallow.md",
    ]);
  });

  it("should handle paths with special characters", () => {
    const paths = [
      "file-with-dashes.md",
      "file_with_underscores.md",
      "file with spaces.md",
    ];
    const result = filterUniquePaths(paths);

    expect(result).toEqual([
      "file with spaces.md",
      "file-with-dashes.md",
      "file_with_underscores.md",
    ]);
  });

  it("should preserve case sensitivity in sorting", () => {
    const paths = ["Z.md", "a.md", "B.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual(["B.md", "Z.md", "a.md"]);
  });

  it("should handle single item array", () => {
    const paths = ["single.md"];
    const result = filterUniquePaths(paths);

    expect(result).toEqual(["single.md"]);
  });
});
