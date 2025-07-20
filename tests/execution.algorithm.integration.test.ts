import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../src/execution.ts";
import type { FSAction } from "../src/utils.ts";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

describe("executeActions - integration tests", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory within the current working directory
    const randomName = randomBytes(16).toString("hex");
    testDir = join(process.cwd(), ".test-tmp", `sync-rules-exec-${randomName}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("complex scenarios", () => {
    it("should handle 100+ actions across multiple directories", async () => {
      const actions: FSAction[] = [];

      // Create a complex directory structure
      for (let i = 0; i < 10; i++) {
        const dirPath = join(testDir, `dir${i}`);
        actions.push({ type: "mkdir", path: dirPath });

        // Add subdirectories
        for (let j = 0; j < 3; j++) {
          const subDirPath = join(dirPath, `subdir${j}`);
          actions.push({ type: "mkdir", path: subDirPath });

          // Add files to subdirectories
          for (let k = 0; k < 3; k++) {
            actions.push({
              type: "write",
              path: join(subDirPath, `file${k}.txt`),
              content: `Content for file ${i}-${j}-${k}`,
            });
          }
        }
      }

      const result = await executeActions(actions, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toHaveLength(40); // 10 dirs + 30 subdirs
      expect(result.changes.written).toHaveLength(90); // 10 * 3 * 3 files

      // Verify a sample of files exist
      const sampleFile = join(testDir, "dir5", "subdir2", "file1.txt");
      const content = await fs.readFile(sampleFile, "utf8");
      expect(content).toBe("Content for file 5-2-1");
    });

    it("should handle mixed operations in correct order", async () => {
      const sourceDir = join(testDir, "source");
      const destDir = join(testDir, "dest");

      // Create source structure first
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(join(sourceDir, "original.txt"), "Original content");

      const actions: FSAction[] = [
        // Create destination structure
        { type: "mkdir", path: destDir },
        { type: "mkdir", path: join(destDir, "subdir") },

        // Copy files
        {
          type: "copy",
          from: join(sourceDir, "original.txt"),
          to: join(destDir, "copied.txt"),
        },

        // Write new files
        {
          type: "write",
          path: join(destDir, "new.txt"),
          content: "New content",
        },
        {
          type: "write",
          path: join(destDir, "subdir", "nested.txt"),
          content: "Nested content",
        },
      ];

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toHaveLength(2);
      expect(result.changes.copied).toHaveLength(1);
      expect(result.changes.written).toHaveLength(2);

      // Verify files
      const copiedContent = await fs.readFile(
        join(destDir, "copied.txt"),
        "utf8",
      );
      expect(copiedContent).toBe("Original content");

      const nestedContent = await fs.readFile(
        join(destDir, "subdir", "nested.txt"),
        "utf8",
      );
      expect(nestedContent).toBe("Nested content");
    });

    it("should execute actions in parallel groups for performance", async () => {
      const startTime = Date.now();

      // Create actions that would take longer if executed sequentially
      const actions: FSAction[] = [];

      // Create 10 independent directories with files
      for (let i = 0; i < 10; i++) {
        const dirPath = join(testDir, `parallel-dir${i}`);
        actions.push({ type: "mkdir", path: dirPath });

        // Add multiple files to each directory
        for (let j = 0; j < 5; j++) {
          actions.push({
            type: "write",
            path: join(dirPath, `file${j}.txt`),
            content: `Content ${i}-${j}`,
          });
        }
      }

      const result = await executeActions(actions, {});

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toHaveLength(10);
      expect(result.changes.written).toHaveLength(50);

      // Should complete relatively quickly due to parallel execution
      // (exact timing depends on system, but should be under 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it("should handle deep directory structures", async () => {
      // Create a very deep directory structure
      let currentPath = testDir;
      const actions: FSAction[] = [];

      for (let i = 0; i < 20; i++) {
        currentPath = join(currentPath, `level${i}`);
        actions.push({ type: "mkdir", path: currentPath });
      }

      // Add a file at the deepest level
      actions.push({
        type: "write",
        path: join(currentPath, "deep.txt"),
        content: "Very deep file",
      });

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toHaveLength(20);
      expect(result.changes.written).toHaveLength(1);

      // Verify the deep file exists
      const deepContent = await fs.readFile(
        join(currentPath, "deep.txt"),
        "utf8",
      );
      expect(deepContent).toBe("Very deep file");
    });
  });

  describe("dry-run mode", () => {
    it("should not create any files in dry-run mode", async () => {
      const actions: FSAction[] = [
        { type: "mkdir", path: join(testDir, "should-not-exist") },
        {
          type: "write",
          path: join(testDir, "should-not-exist.txt"),
          content: "Nope",
        },
      ];

      const result = await executeActions(actions, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toHaveLength(1);
      expect(result.changes.written).toHaveLength(1);

      // Verify nothing was actually created
      const dirExists = await fs
        .access(join(testDir, "should-not-exist"))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);

      const fileExists = await fs
        .access(join(testDir, "should-not-exist.txt"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });
});
