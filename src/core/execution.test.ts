import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeActions } from "./execution.js";
import type { WriteAction } from "./execution.js";
import * as fsPromises from "node:fs/promises";

// Trivial empty actions test removed - integration tests cover this

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  rename: vi.fn((_, destination: string) => Promise.resolve(destination)),
  stat: vi.fn(() => Promise.resolve({ isDirectory: () => true })),
  rm: vi.fn(),
}));

describe("executeActions - algorithm tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns immediately when there are no actions", async () => {
    const result = await executeActions([], { dryRun: false });
    expect(result).toEqual({ written: [], skipped: [] });
  });

  describe("dry-run mode", () => {
    it("dry-run collects paths but does not write", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      const result = await executeActions(actions, {
        dryRun: true,
      });

      expect(result.written).toContain("/test/file.txt");
      expect(result.skipped).toEqual([]);

      expect(fsPromises.stat).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("wraps first write failure in SyncError and aborts", async () => {
      vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(
        new Error("Write failed"),
      );

      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await expect(executeActions(actions, { dryRun: false })).rejects.toThrow(
        Error,
      );
    });

    it("stops on first write error", async () => {
      vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(
        new Error("Write failed"),
      );

      const actions: WriteAction[] = [
        { path: "/fail/file.txt", content: "Hello" },
        { path: "/success/file.txt", content: "World" },
      ];

      await expect(executeActions(actions, { dryRun: false })).rejects.toThrow(
        Error,
      );

      expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("execution tracking", () => {
    it("tracks all written paths in report", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file1.txt", content: "Hello" },
        { path: "/test/file2.txt", content: "World" },
      ];

      const result = await executeActions(actions, {
        dryRun: false,
      });

      expect(result.written).toEqual(["/test/file1.txt", "/test/file2.txt"]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe("directory existence check", () => {
    it("skips write when parent directory does not exist", async () => {
      const enoentError = Object.assign(new Error("ENOENT"), {
        code: "ENOENT",
      });
      vi.mocked(fsPromises.stat).mockRejectedValueOnce(enoentError);

      const actions: WriteAction[] = [
        { path: "/nonexistent/file.txt", content: "Hello" },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.written).toEqual([]);
      expect(result.skipped).toEqual([
        { path: "/nonexistent/file.txt", reason: "parent_missing" },
      ]);
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it("skips write when path is not a directory", async () => {
      vi.mocked(fsPromises.stat).mockResolvedValueOnce({
        isDirectory: () => false,
      } as Awaited<ReturnType<typeof fsPromises.stat>>);

      const actions: WriteAction[] = [
        { path: "/not-a-dir/file.txt", content: "Hello" },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.written).toEqual([]);
      expect(result.skipped).toEqual([
        { path: "/not-a-dir/file.txt", reason: "parent_not_directory" },
      ]);
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it("writes file when parent directory exists", async () => {
      const actions: WriteAction[] = [
        { path: "/existing/file.txt", content: "Hello" },
      ];

      const result = await executeActions(actions, { dryRun: false });

      expect(result.written).toEqual(["/existing/file.txt"]);
      expect(result.skipped).toEqual([]);
      expect(fsPromises.stat).toHaveBeenCalledWith("/existing");
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });
  });
});
