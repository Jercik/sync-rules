import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../../src/core/execution.js";
import type { WriteAction } from "../../src/core/execution.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  makeTemporaryDirectory,
  cleanupDirectory,
} from "../_helpers/test-utilities.js";

describe("executeActions - integration tests", () => {
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await makeTemporaryDirectory("sync-rules-exec-");
  });

  afterEach(async () => {
    await cleanupDirectory(testDirectory);
  });

  describe("native fs integration", () => {
    it("should skip and warn when parent directory does not exist", async () => {
      const nestedPath = path.join(testDirectory, "nonexistent", "file.txt");
      const actions: WriteAction[] = [
        { path: nestedPath, content: "Hello nested!" },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.skipped).toContain(nestedPath);
      expect(result.written).toEqual([]);
    });

    it("should overwrite existing files", async () => {
      const filePath = path.join(testDirectory, "overwrite.txt");
      await fs.writeFile(filePath, "Old content");

      const actions: WriteAction[] = [
        { path: filePath, content: "New content" },
      ];

      await executeActions(actions, { dryRun: false });

      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("New content");
    });
  });
});
