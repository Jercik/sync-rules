import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeActions } from "./execution.js";
import type { WriteAction } from "./execution.js";
import * as fsPromises from "node:fs/promises";

describe("executeActions", () => {
  describe("basic functionality", () => {
    it("should return empty written array for empty actions array", async () => {
      const result = await executeActions([]);

      expect(result).toEqual({
        written: [],
      });
    });
  });
});

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../utils/paths.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/paths.ts")>(
      "../utils/paths.ts",
    );
  return {
    ...actual,
    normalizePath: vi.fn((path: string) => path),
  };
});

vi.mock("../utils/log.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/log.ts")>("../utils/log.ts");
  const child = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    ...actual,
    getLogger: vi.fn(() => child),
    rootLogger: child,
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

      const result = await executeActions(actions, {
        dryRun: true,
      });

      expect(result.written).toContain("/test/file.txt");

      // Verify no actual FS operations were called
      expect(fsPromises.mkdir).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it("should log previews in dry-run mode", async () => {
      const { rootLogger: logger } = await import("../utils/log.ts");
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: true });

      expect(logger.debug).toHaveBeenCalledWith({
        evt: "write.preview",
        path: "/test/file.txt",
        len: 5,
      });
    });
  });

  describe("action execution", () => {
    it("should execute write actions using fs/promises", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: false });

      expect(fsPromises.mkdir).toHaveBeenCalledWith("/test", {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        "/test/file.txt",
        "Hello",
        "utf8",
      );
    });
  });

  describe("error handling", () => {
    it("should fail fast on error", async () => {
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

    it("should fail on first error in any group", async () => {
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

      // Second write should not be attempted
      expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("execution tracking", () => {
    it("should track all successful operations", async () => {
      const actions: WriteAction[] = [
        { path: "/test/file1.txt", content: "Hello" },
        { path: "/test/file2.txt", content: "World" },
      ];

      const result = await executeActions(actions, {
        dryRun: false,
      });

      expect(result.written).toEqual(["/test/file1.txt", "/test/file2.txt"]);
    });
  });

  describe("debug logging", () => {
    it("should log operations in debug mode", async () => {
      const { rootLogger: logger } = await import("../utils/log.ts");
      const actions: WriteAction[] = [
        { path: "/test/file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: false });

      expect(logger.debug).toHaveBeenCalledWith({
        evt: "write.start",
        path: "/test/file.txt",
        len: 5,
      });
    });
  });

  describe("path normalization", () => {
    it("should normalize all paths upfront", async () => {
      const { normalizePath } = await import("../utils/paths.ts");
      const actions: WriteAction[] = [
        { path: "/test/../file.txt", content: "Hello" },
      ];

      await executeActions(actions, { dryRun: true });

      expect(normalizePath).toHaveBeenCalledWith("/test/../file.txt");
    });
  });
});
