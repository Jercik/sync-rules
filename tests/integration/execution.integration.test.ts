import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeActions } from "../../src/core/execution.js";
import type { WriteAction } from "../../src/core/execution.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanupDir } from "../_helpers/test-utils.js";

describe("executeActions - integration tests", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await makeTempDir("sync-rules-exec-");
  });

  afterEach(async () => {
    await cleanupDir(testDir);
  });

  describe("native fs integration", () => {
    it("should automatically create parent directories for write actions", async () => {
      const nestedPath = join(testDir, "a", "b", "c", "file.txt");
      const actions: WriteAction[] = [
        { path: nestedPath, content: "Hello nested!" },
      ];

      await executeActions(actions, { dryRun: false });

      const content = await fs.readFile(nestedPath, "utf8");
      expect(content).toBe("Hello nested!");
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
  });
});
