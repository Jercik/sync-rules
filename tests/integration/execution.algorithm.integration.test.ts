import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../../src/core/execution.js";
import type { WriteAction } from "../../src/core/execution.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanupDir } from "../_helpers/test-utils";

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

      const result = await executeActions(actions, { dryRun: false });

      expect(result.written).toHaveLength(90); // 10 * 3 * 3 files

      // Verify a sample of files exist
      const sampleFile = join(testDir, "dir5", "subdir2", "file1.txt");
      const content = await fs.readFile(sampleFile, "utf8");
      expect(content).toBe("Content for file 5-2-1");
    });

    it("should handle deep directory structures", async () => {
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

      expect(result.written).toHaveLength(1);

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

      expect(result.written).toHaveLength(1);

      // Verify nothing was actually created
      const fileExists = await fs
        .access(join(testDir, "should-not-exist.txt"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });
});
