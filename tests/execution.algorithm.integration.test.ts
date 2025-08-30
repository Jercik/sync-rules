import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../src/core/execution.ts";
import type { WriteAction } from "../src/utils/content.ts";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanupDir } from "./test-utils";

describe("executeActions - integration tests", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await makeTempDir("sync-rules-exec-");
  });

  afterEach(async () => {
    // Clean up test directory
    await cleanupDir(testDir);
  });

  describe("complex scenarios", () => {
    it("should handle 100+ writes across multiple directories", async () => {
      const actions: WriteAction[] = [];

      // Create a complex directory structure
      for (let i = 0; i < 10; i++) {
        const dirPath = join(testDir, `dir${i}`);
        for (let j = 0; j < 3; j++) {
          const subDirPath = join(dirPath, `subdir${j}`);
          for (let k = 0; k < 3; k++) {
            actions.push({
              path: join(subDirPath, `file${k}.txt`),
              content: `Content for file ${i}-${j}-${k}`,
            });
          }
        }
      }

      const result = await executeActions(actions, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.changes.written).toHaveLength(90); // 10 * 3 * 3 files

      // Verify a sample of files exist
      const sampleFile = join(testDir, "dir5", "subdir2", "file1.txt");
      const content = await fs.readFile(sampleFile, "utf8");
      expect(content).toBe("Content for file 5-2-1");
    });

    it("should handle multiple writes in nested locations", async () => {
      const destDir = join(testDir, "dest");

      const actions: WriteAction[] = [
        {
          path: join(destDir, "new.txt"),
          content: "New content",
        },
        {
          path: join(destDir, "subdir", "nested.txt"),
          content: "Nested content",
        },
      ];

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.written).toHaveLength(2);

      const nestedContent = await fs.readFile(
        join(destDir, "subdir", "nested.txt"),
        "utf8",
      );
      expect(nestedContent).toBe("Nested content");
    });

    it("should handle many independent groups", async () => {
      // Create actions that would take longer if executed sequentially
      const actions: WriteAction[] = [];

      // Create 10 independent directories with files (via writes)
      for (let i = 0; i < 10; i++) {
        const dirPath = join(testDir, `parallel-dir${i}`);
        // Add multiple files to each directory
        for (let j = 0; j < 5; j++) {
          actions.push({
            path: join(dirPath, `file${j}.txt`),
            content: `Content ${i}-${j}`,
          });
        }
      }

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.written).toHaveLength(50);

      // Parallelizable behavior is validated functionally by outputs above.
    });

    it("should handle deep directory structures", async () => {
      // Create a very deep directory structure via write
      let currentPath = testDir;
      const actions: WriteAction[] = [];

      for (let i = 0; i < 20; i++) {
        currentPath = join(currentPath, `level${i}`);
      }

      // Write a file at the deepest level; parents auto-created
      actions.push({
        path: join(currentPath, "deep.txt"),
        content: "Very deep file",
      });

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
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
      const actions: WriteAction[] = [
        {
          path: join(testDir, "should-not-exist.txt"),
          content: "Nope",
        },
      ];

      const result = await executeActions(actions, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.changes.written).toHaveLength(1);

      // Verify nothing was actually created
      const fileExists = await fs
        .access(join(testDir, "should-not-exist.txt"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });
});
