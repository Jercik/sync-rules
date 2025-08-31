import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../../src/core/execution.js";
import type { WriteAction } from "../../src/utils/content.js";
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

  describe("fs-extra integration", () => {
    it("should automatically create parent directories for write actions", async () => {
      const nestedPath = join(testDir, "a", "b", "c", "file.txt");
      const actions: WriteAction[] = [
        { path: nestedPath, content: "Hello nested!" },
      ];

      await executeActions(actions, { dryRun: false });

      const content = await fs.readFile(nestedPath, "utf8");
      expect(content).toBe("Hello nested!");
    });

    it("should handle multiple writes in nested directories", async () => {
      const file1 = join(testDir, "dir1", "subdir1", "file1.txt");
      const file2 = join(testDir, "dir2", "subdir2", "file2.txt");
      const actions: WriteAction[] = [
        { path: file1, content: "Content 1" },
        { path: file2, content: "Content 2" },
      ];

      await executeActions(actions, { dryRun: false });

      const content1 = await fs.readFile(file1, "utf8");
      const content2 = await fs.readFile(file2, "utf8");
      expect(content1).toBe("Content 1");
      expect(content2).toBe("Content 2");
    });

    it("should overwrite existing files", async () => {
      const filePath = join(testDir, "overwrite.txt");
      await fs.writeFile(filePath, "Old content");

      const actions: WriteAction[] = [
        { path: filePath, content: "New content" },
      ];

      await executeActions(actions, { dryRun: false });

      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("New content");
    });

    it("should handle multiple writes without explicit mkdir", async () => {
      const actions: WriteAction[] = [
        {
          path: join(testDir, "new", "file.txt"),
          content: "Written",
        },
        {
          path: join(testDir, "other", "file2.txt"),
          content: "Also written",
        },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.success).toBe(true);
      expect(result.written).toHaveLength(2);

      // Verify files exist
      const writtenContent1 = await fs.readFile(
        join(testDir, "new", "file.txt"),
        "utf8",
      );
      const writtenContent2 = await fs.readFile(
        join(testDir, "other", "file2.txt"),
        "utf8",
      );
      expect(writtenContent1).toBe("Written");
      expect(writtenContent2).toBe("Also written");
    });
  });
});
