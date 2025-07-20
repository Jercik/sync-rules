import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { safeMkdir, simpleWrite, safeCopy } from "../src/execution.ts";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

describe("helper functions - integration tests", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory within the current working directory
    const randomName = randomBytes(16).toString("hex");
    testDir = join(process.cwd(), ".test-tmp", `sync-rules-test-${randomName}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("safeMkdir", () => {
    it("should create nested directories", async () => {
      const nestedPath = join(testDir, "a", "b", "c", "d");

      await safeMkdir(nestedPath);

      const stats = await fs.stat(nestedPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should not throw when directory already exists", async () => {
      const dirPath = join(testDir, "existing");
      await fs.mkdir(dirPath);

      await expect(safeMkdir(dirPath)).resolves.not.toThrow();

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should create single directory when recursive is false", async () => {
      const dirPath = join(testDir, "single");

      await safeMkdir(dirPath, false);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("simpleWrite", () => {
    it("should write content to file", async () => {
      const filePath = join(testDir, "test.txt");
      const content = "Hello, World!";

      await simpleWrite(filePath, content);

      const readContent = await fs.readFile(filePath, "utf8");
      expect(readContent).toBe(content);
    });

    it("should overwrite existing file", async () => {
      const filePath = join(testDir, "overwrite.txt");
      await fs.writeFile(filePath, "Old content");

      await simpleWrite(filePath, "New content");

      const readContent = await fs.readFile(filePath, "utf8");
      expect(readContent).toBe("New content");
    });
  });

  describe("safeCopy", () => {
    it("should copy single file", async () => {
      const srcFile = join(testDir, "source.txt");
      const destFile = join(testDir, "dest.txt");
      await fs.writeFile(srcFile, "File content");

      await safeCopy(srcFile, destFile);

      const content = await fs.readFile(destFile, "utf8");
      expect(content).toBe("File content");
    });

    it("should copy directory recursively", async () => {
      const srcDir = join(testDir, "src-dir");
      const destDir = join(testDir, "dest-dir");

      // Create source directory structure
      await fs.mkdir(join(srcDir, "sub"), { recursive: true });
      await fs.writeFile(join(srcDir, "file1.txt"), "Content 1");
      await fs.writeFile(join(srcDir, "sub", "file2.txt"), "Content 2");

      await safeCopy(srcDir, destDir);

      // Verify copied structure
      const file1 = await fs.readFile(join(destDir, "file1.txt"), "utf8");
      const file2 = await fs.readFile(
        join(destDir, "sub", "file2.txt"),
        "utf8",
      );
      expect(file1).toBe("Content 1");
      expect(file2).toBe("Content 2");
    });

    it("should overwrite existing files with force option", async () => {
      const srcFile = join(testDir, "source.txt");
      const destFile = join(testDir, "dest.txt");

      await fs.writeFile(srcFile, "New content");
      await fs.writeFile(destFile, "Old content");

      await safeCopy(srcFile, destFile);

      const content = await fs.readFile(destFile, "utf8");
      expect(content).toBe("New content");
    });
  });
});
