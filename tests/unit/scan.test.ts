import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "path";
import { scan } from "../../src/scan.ts";
import { createTestProject, testContext } from "../helpers/setup.ts";
import {
  createFile,
  createBinaryFile,
  createSymlink,
} from "../helpers/fs-utils.ts";
import * as core from "../../src/utils/core.ts";

vi.mock("../../src/utils/core.ts", async () => {
  const actual = await vi.importActual("../../src/utils/core.ts");
  return {
    ...actual,
    getFileHash: vi.fn(),
  };
});

const mockGetFileHash = vi.mocked(core.getFileHash);

describe("scan", () => {
  let projectPath: string;

  beforeEach(async () => {
    mockGetFileHash.mockClear();
    projectPath = await createTestProject("scan-test", {
      "config.js": "module.exports = {};",
      "package.json": '{"name": "test"}',
      "src/index.ts": "export const test = true;",
      "src/utils/helper.ts": "export function helper() {}",
      ".gitignore": "node_modules/",
    });

    // Mock hash calculation
    mockGetFileHash.mockImplementation(async (filePath: string) => {
      const content = path.basename(filePath);
      return `hash-of-${content}`;
    });
  });

  it("should discover only .md files and calculate hashes", async () => {
    await createFile(path.join(projectPath, "rules.md"), "# Rules");
    await createFile(path.join(projectPath, "style.md"), "# Style Guide");

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });

    // Only .md files should be discovered
    expect(result.size).toBe(2);
    expect(mockGetFileHash).toHaveBeenCalledTimes(2);
    expect(result.get("rules.md")?.hash).toBe("hash-of-rules.md");
    expect(result.get("style.md")?.hash).toBe("hash-of-style.md");
    // Non-.md files should not be included
    expect(result.has("config.js")).toBe(false);
    expect(result.has("package.json")).toBe(false);
  });

  it("should identify local .md files", async () => {
    await createFile(path.join(projectPath, "rules.md"), "# Rules");
    await createFile(path.join(projectPath, "config.local.md"), "local config");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });

    expect(result.get("rules.md")?.isLocal).toBe(false);
    expect(result.get("config.local.md")?.isLocal).toBe(true);
  });

  it("should skip symbolic links", async () => {
    await createFile(path.join(projectPath, "config.md"), "# Config");
    const targetPath = path.join(projectPath, "config.md");
    const symlinkPath = path.join(projectPath, "config.symlink.md");
    await createSymlink(targetPath, symlinkPath);

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });

    expect(result.has("config.symlink.md")).toBe(false);
    expect(result.has("config.md")).toBe(true);
  });

  it("should handle hash calculation failures gracefully", async () => {
    // Create .md files for testing
    await createFile(path.join(projectPath, "src/index.md"), "# Index");
    await createFile(path.join(projectPath, "src/utils/helper.md"), "# Helper");

    const errorFile = "src/index.md";
    mockGetFileHash.mockImplementation(async (filePath) => {
      if (filePath.endsWith(errorFile)) {
        throw new Error("EACCES: permission denied, open 'src/index.md'");
      }
      return `hash-of-${path.basename(filePath)}`;
    });
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["src/**/*.md"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(result.get(errorFile)?.hash).toBeUndefined();
    expect(result.get("src/utils/helper.md")?.hash).toBe("hash-of-helper.md");
  });

  it("should handle an empty directory", async () => {
    const emptyProjectPath = await createTestProject("empty-project", {});
    const result = await scan({
      projectDir: emptyProjectPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });

    expect(result.size).toBe(0);
  });

  it("should handle multiple exclusion patterns", async () => {
    await createFile(path.join(projectPath, "test.spec.md"), "# Test spec");
    await createFile(
      path.join(projectPath, "another-test.md"),
      "# Another test",
    );
    await createFile(path.join(projectPath, "rules.md"), "# Rules");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: ["*.spec.md", "another-test.md"],
    });
    expect(result.size).toBe(1);
    expect(result.has("rules.md")).toBe(true);
    expect(result.has("test.spec.md")).toBe(false);
    expect(result.has("another-test.md")).toBe(false);
  });
  it("should respect exclusion patterns", async () => {
    await createFile(path.join(projectPath, "test.spec.md"), "# Test spec");
    await createFile(path.join(projectPath, "rules.md"), "# Rules");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: ["*.spec.md"],
    });
    expect(result.size).toBe(1);
    expect(result.has("rules.md")).toBe(true);
    expect(result.has("test.spec.md")).toBe(false);
  });

  it("should handle binary content in .md files", async () => {
    // Create an .md file with binary-like content
    const binaryContentMd = path.join(projectPath, "binary-content.md");
    const binaryContent = Buffer.alloc(1024).toString('base64');
    await createFile(binaryContentMd, `# Binary Data\n\n\`\`\`\n${binaryContent}\n\`\`\``);

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.md"],
      excludePatterns: [],
    });

    expect(result.size).toBe(1);
    expect(result.get("binary-content.md")?.hash).toBe("hash-of-binary-content.md");
  });
  it("should return an empty map for a non-existent directory", async () => {
    const nonExistentPath = path.join(testContext.tempDir, "non-existent");
    const result = await scan({
      projectDir: nonExistentPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });
    expect(result.size).toBe(0);
  });

  it("should handle literal directory patterns and only include .md files", async () => {
    // Create a .kilocode directory with files
    await createFile(path.join(projectPath, ".kilocode/rules.md"), "# Rules");
    await createFile(
      path.join(projectPath, ".kilocode/config.yml"),
      "config: true",
    );
    await createFile(path.join(projectPath, ".kilocode/style.md"), "# Style");

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".kilocode"],
      excludePatterns: [],
    });

    // Only .md files should be included
    expect(result.size).toBe(2);
    expect(result.has(".kilocode/rules.md")).toBe(true);
    expect(result.has(".kilocode/style.md")).toBe(true);
    expect(result.has(".kilocode/config.yml")).toBe(false);
  });

  it("should detect local files in nested directories", async () => {
    await createFile(
      path.join(projectPath, ".kilocode/rules.local.md"),
      "local rules",
    );
    await createFile(path.join(projectPath, ".kilocode/config.md"), "config");

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".kilocode"],
      excludePatterns: [],
    });

    expect(result.get(".kilocode/rules.local.md")?.isLocal).toBe(true);
    expect(result.get(".kilocode/config.md")?.isLocal).toBe(false);
  });

  it("should handle mixed glob and literal patterns with .md constraint", async () => {
    // Create various files
    await createFile(path.join(projectPath, ".cursorrules"), "cursor rules");
    await createFile(
      path.join(projectPath, ".cursorrules.md"),
      "# Cursor rules",
    );
    // Create .kilocode directory
    await createFile(
      path.join(projectPath, ".kilocode/rules.md"),
      "# Kilo rules",
    );
    await createFile(path.join(projectPath, "guide.md"), "# Guide");

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".cursorrules", ".kilocode", "*"],
      excludePatterns: [],
    });

    // Only .md files should be included
    expect(result.size).toBe(3);
    expect(result.has(".cursorrules")).toBe(false); // Not .md
    expect(result.has(".cursorrules.md")).toBe(true);
    expect(result.has(".kilocode/rules.md")).toBe(true);
    expect(result.has("guide.md")).toBe(true);
    expect(result.has("package.json")).toBe(false); // Not .md
  });

  it("should exclude non-.md files like .DS_Store automatically", async () => {
    await createFile(path.join(projectPath, ".DS_Store"), "system file");
    await createFile(path.join(projectPath, "rules.md"), "# Rules");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [], // No need to explicitly exclude .DS_Store
    });

    expect(result.has(".DS_Store")).toBe(false); // Automatically excluded as non-.md
    expect(result.has("rules.md")).toBe(true);
  });

  it("should handle special characters in .md file names", async () => {
    await createFile(
      path.join(projectPath, "file with spaces.md"),
      "# File with spaces",
    );
    await createFile(
      path.join(projectPath, "file-with-dashes.md"),
      "# File with dashes",
    );

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [],
    });

    const paths = Array.from(result.keys());
    expect(paths).toContain("file with spaces.md");
    expect(paths).toContain("file-with-dashes.md");
  });

  it("should maintain consistent hash for identical content", async () => {
    await createFile(path.join(projectPath, "copy1.md"), "# Same content");
    await createFile(path.join(projectPath, "copy2.md"), "# Same content");

    // Mock same hash for identical content
    mockGetFileHash.mockImplementation(async (filePath) => {
      if (filePath.includes("copy1.md") || filePath.includes("copy2.md")) {
        return "identical-hash";
      }
      return `hash-of-${path.basename(filePath)}`;
    });

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["copy*"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(result.get("copy1.md")?.hash).toBe("identical-hash");
    expect(result.get("copy2.md")?.hash).toBe("identical-hash");
  });

  it("should only include .md files when using various pattern types", async () => {
    // Create a mix of file types
    await createFile(path.join(projectPath, ".cursorrules"), "Not markdown");
    await createFile(
      path.join(projectPath, ".cursorrules.md"),
      "# Cursor Rules",
    );
    await createFile(path.join(projectPath, ".clinerules.json"), "{}");
    await createFile(path.join(projectPath, ".clinerules.md"), "# CLI Rules");
    await createFile(
      path.join(projectPath, ".kilocode/rules.yml"),
      "rules: true",
    );
    await createFile(
      path.join(projectPath, ".kilocode/rules.md"),
      "# Kilocode Rules",
    );
    await createFile(path.join(projectPath, "README.md"), "# Readme");
    await createFile(
      path.join(projectPath, "config.js"),
      "module.exports = {};",
    );

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".cursorrules", ".clinerules*", ".kilocode", "**"],
      excludePatterns: [],
    });

    // Only .md files should be included
    expect(result.size).toBe(4);
    expect(result.has(".cursorrules.md")).toBe(true);
    expect(result.has(".clinerules.md")).toBe(true);
    expect(result.has(".kilocode/rules.md")).toBe(true);
    expect(result.has("README.md")).toBe(true);

    // Non-.md files should be excluded
    expect(result.has(".cursorrules")).toBe(false);
    expect(result.has(".clinerules.json")).toBe(false);
    expect(result.has(".kilocode/rules.yml")).toBe(false);
    expect(result.has("config.js")).toBe(false);
  });
});
