import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeActions } from "../src/core/execution.ts";
import type { WriteAction } from "../src/utils/content.ts";
import * as fsExtra from "fs-extra";

describe("executeActions", () => {
  describe("basic functionality", () => {
    it("should return success: true for empty actions array", async () => {
      const result = await executeActions([], {});

      expect(result).toEqual({
        success: true,
        changes: { written: [] },
        errors: [],
      });
    });
  });
});

// Mock fs-extra
vi.mock("fs-extra", () => ({
  outputFile: vi.fn(),
}));

// Mock utils
vi.mock("../src/utils/paths.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/utils/paths.ts")>(
    "../src/utils/paths.ts",
  );
  return {
    ...actual,
    normalizePath: vi.fn((path: string) => path),
  };
});

vi.mock("../src/utils/logger.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/utils/logger.ts")>(
    "../src/utils/logger.ts",
  );
  return {
    ...actual,
    logMessage: vi.fn(),
  };
});

describe("executeActions - algorithm tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("dry-run mode", () => {
    it("should preview actions without executing them", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      const result = await executeActions(actions, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.changes.written).toContain("/test/file.txt");

      // Verify no actual FS operations were called
      expect(fsExtra.outputFile).not.toHaveBeenCalled();
    });

    it("should log previews in verbose dry-run mode", async () => {
      const { logMessage } = await import("../src/utils/logger.ts");
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: true, verbose: true });

      expect(logMessage).toHaveBeenCalledWith(
        "[Dry-run] [Write] /test/file.txt",
        true,
      );
    });
  });

  describe("action execution", () => {
    it("should execute write actions using fs-extra", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: false });

      expect(fsExtra.outputFile).toHaveBeenCalledWith(
        "/test/file.txt",
        "Hello",
        "utf8",
      );
    });

    // Copy and mkdir actions are no longer supported
  });

  describe("error handling", () => {
    it("should fail fast on error", async () => {
      vi.mocked(fsExtra.outputFile).mockRejectedValueOnce(
        new Error("Write failed"),
      );

      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await expect(executeActions(actions, { dryRun: false })).rejects.toThrow(
        Error,
      );
    });

    it("should fail on first error in any group", async () => {
      vi.mocked(fsExtra.outputFile).mockRejectedValueOnce(
        new Error("Write failed"),
      );

      const actions: WriteAction[] = [
        { path: "/fail/file.txt", content: "Hello" },
        { path: "/success/file.txt", content: "World" },
      ];

      await expect(executeActions(actions, { dryRun: false })).rejects.toThrow(
        Error,
      );

      // Second write should not be attempted
      expect(fsExtra.outputFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("execution tracking", () => {
    it("should track all successful operations", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file1.txt", content: "Hello" },
        { path: "/test/file2.txt", content: "World" },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changes.written).toEqual([
        "/test/file1.txt",
        "/test/file2.txt",
      ]);
    });
  });

  describe("verbose logging", () => {
    it("should log operations when verbose is true", async () => {
      const { logMessage } = await import("../src/utils/logger.ts");
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: false, verbose: true });

      expect(logMessage).toHaveBeenCalledWith(
        "Writing to: /test/file.txt",
        true,
      );
    });
  });

  describe("path normalization", () => {
    it("should normalize all paths upfront", async () => {
      const { normalizePath } = await import("../src/utils/paths.ts");
      const actions: WriteAction[] = [
        { path: "/test/../file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: true });

      expect(normalizePath).toHaveBeenCalledWith("/test/../file.txt");
    });
  });
});
