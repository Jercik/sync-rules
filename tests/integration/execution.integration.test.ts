import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../../src/core/execution.js";
import type { WriteAction } from "../../src/core/execution.js";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function makeTemporaryDirectory(prefix = "sync-rules-test-"): Promise<string> {
  return mkdtemp(path.join(process.env.TEST_TMPDIR ?? tmpdir(), prefix));
}

async function cleanupDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

describe("executeActions - integration tests", () => {
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await makeTemporaryDirectory("sync-rules-exec-");
  });

  afterEach(async () => {
    await cleanupDirectory(testDirectory);
  });

  describe("native fs integration", () => {
    it("should skip when parent directory does not exist", async () => {
      const nestedPath = path.join(testDirectory, "nonexistent", "file.txt");
      const actions: WriteAction[] = [{ path: nestedPath, content: "Hello nested!" }];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.skipped).toEqual([{ path: nestedPath, reason: "parent_missing" }]);
      expect(result.written).toEqual([]);
    });

    it("should overwrite existing files", async () => {
      const filePath = path.join(testDirectory, "overwrite.txt");
      await fs.writeFile(filePath, "Old content");

      const actions: WriteAction[] = [{ path: filePath, content: "New content" }];

      await executeActions(actions, { dryRun: false });

      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("New content");
    });
  });
});
