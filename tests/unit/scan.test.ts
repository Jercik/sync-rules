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

  it("should discover files and calculate hashes", async () => {
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js", "*.json"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(mockGetFileHash).toHaveBeenCalledTimes(2);
    expect(result.get("config.js")?.hash).toBe("hash-of-config.js");
    expect(result.get("package.json")?.hash).toBe("hash-of-package.json");
  });

  it("should identify local files", async () => {
    await createFile(path.join(projectPath, "config.local.js"), "local config");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js"],
      excludePatterns: [],
    });

    expect(result.get("config.js")?.isLocal).toBe(false);
    expect(result.get("config.local.js")?.isLocal).toBe(true);
  });

  it("should skip symbolic links", async () => {
    const targetPath = path.join(projectPath, "config.js");
    const symlinkPath = path.join(projectPath, "config.symlink.js");
    await createSymlink(targetPath, symlinkPath);

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js"],
      excludePatterns: [],
    });

    expect(result.has("config.symlink.js")).toBe(false);
  });

  it("should handle hash calculation failures gracefully", async () => {
    const errorFile = "src/index.ts";
    mockGetFileHash.mockImplementation(async (filePath) => {
      if (filePath.endsWith(errorFile)) {
        throw new Error("EACCES: permission denied, open 'src/index.ts'");
      }
      return `hash-of-${path.basename(filePath)}`;
    });
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["src/**/*.ts"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(result.get(errorFile)?.hash).toBeUndefined();
    expect(result.get("src/utils/helper.ts")?.hash).toBe("hash-of-helper.ts");
  });

  it("should handle an empty directory", async () => {
    const emptyProjectPath = await createTestProject("empty-project", {});
    const result = await scan({
      projectDir: emptyProjectPath,
      rulePatterns: ["*.js"],
      excludePatterns: [],
    });

    expect(result.size).toBe(0);
  });

  it("should handle multiple exclusion patterns", async () => {
    await createFile(path.join(projectPath, "test.spec.js"), "test();");
    await createFile(path.join(projectPath, "another-test.js"), "test();");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js"],
      excludePatterns: ["*.spec.js", "another-test.js"],
    });
    expect(result.size).toBe(1);
    expect(result.has("config.js")).toBe(true);
    expect(result.has("test.spec.js")).toBe(false);
    expect(result.has("another-test.js")).toBe(false);
  });
  it("should respect exclusion patterns", async () => {
    await createFile(path.join(projectPath, "test.spec.js"), "test();");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js"],
      excludePatterns: ["*.spec.js"],
    });
    expect(result.size).toBe(1);
    expect(result.has("config.js")).toBe(true);
    expect(result.has("test.spec.js")).toBe(false);
  });

  it("should handle binary files", async () => {
    const binaryPath = path.join(projectPath, "image.png");
    await createBinaryFile(binaryPath, 1024);

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.png"],
      excludePatterns: [],
    });

    expect(result.size).toBe(1);
    expect(result.get("image.png")?.hash).toBe("hash-of-image.png");
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

  it("should handle literal directory patterns", async () => {
    // Create a .kilocode directory with files
    await createFile(path.join(projectPath, ".kilocode/rules.md"), "# Rules");
    await createFile(
      path.join(projectPath, ".kilocode/config.yml"),
      "config: true",
    );

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".kilocode"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(result.has(".kilocode/rules.md")).toBe(true);
    expect(result.has(".kilocode/config.yml")).toBe(true);
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

  it("should handle mixed glob and literal patterns", async () => {
    // Create .cursorrules file
    await createFile(path.join(projectPath, ".cursorrules"), "cursor rules");
    // Create .kilocode directory
    await createFile(
      path.join(projectPath, ".kilocode/rules.md"),
      "kilo rules",
    );

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: [".cursorrules", ".kilocode", "*.json"],
      excludePatterns: [],
    });

    expect(result.size).toBe(3);
    expect(result.has(".cursorrules")).toBe(true);
    expect(result.has(".kilocode/rules.md")).toBe(true);
    expect(result.has("package.json")).toBe(true);
  });

  it("should exclude .DS_Store files by default patterns", async () => {
    await createFile(path.join(projectPath, ".DS_Store"), "system file");
    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*"],
      excludePatterns: [".DS_Store"],
    });

    expect(result.has(".DS_Store")).toBe(false);
  });

  it("should handle special characters in file names", async () => {
    await createFile(
      path.join(projectPath, "file with spaces.js"),
      "module.exports = {};",
    );
    await createFile(
      path.join(projectPath, "file-with-dashes.js"),
      "module.exports = {};",
    );

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["*.js"],
      excludePatterns: [],
    });

    const paths = Array.from(result.keys());
    expect(paths).toContain("file with spaces.js");
    expect(paths).toContain("file-with-dashes.js");
  });

  it("should maintain consistent hash for identical content", async () => {
    await createFile(path.join(projectPath, "copy1.js"), "const x = 1;");
    await createFile(path.join(projectPath, "copy2.js"), "const x = 1;");

    // Mock same hash for identical content
    mockGetFileHash.mockImplementation(async (filePath) => {
      if (filePath.includes("copy1.js") || filePath.includes("copy2.js")) {
        return "identical-hash";
      }
      return `hash-of-${path.basename(filePath)}`;
    });

    const result = await scan({
      projectDir: projectPath,
      rulePatterns: ["copy*.js"],
      excludePatterns: [],
    });

    expect(result.size).toBe(2);
    expect(result.get("copy1.js")?.hash).toBe("identical-hash");
    expect(result.get("copy2.js")?.hash).toBe("identical-hash");
  });
});
