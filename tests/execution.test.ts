import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeActions,
  safeMkdir,
  simpleWrite,
  safeCopy,
  previewAction,
} from "../src/execution.ts";
import type { FSAction } from "../src/utils.ts";
import { promises as fs } from "node:fs";

describe("executeActions", () => {
  describe("basic functionality", () => {
    it("should return success: true for empty actions array", async () => {
      const result = await executeActions([], {});

      expect(result).toEqual({
        success: true,
        changes: {
          written: [],
          copied: [],
          createdDirs: [],
        },
        errors: [],
      });
    });

    it("should handle empty actions with verbose option", async () => {
      const result = await executeActions([], { verbose: true });

      expect(result).toEqual({
        success: true,
        changes: {
          written: [],
          copied: [],
          createdDirs: [],
        },
        errors: [],
      });
    });

    it("should handle empty actions with dryRun option", async () => {
      const result = await executeActions([], { dryRun: true });

      expect(result).toEqual({
        success: true,
        changes: {
          written: [],
          copied: [],
          createdDirs: [],
        },
        errors: [],
      });
    });

    it("should handle empty actions with all options", async () => {
      const result = await executeActions([], {
        dryRun: true,
        verbose: true,
      });

      expect(result).toEqual({
        success: true,
        changes: {
          written: [],
          copied: [],
          createdDirs: [],
        },
        errors: [],
      });
    });
  });
});

// Mock fs module
vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    cp: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock utils
vi.mock("../src/utils.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../src/utils.ts")>("../src/utils.ts");
  return {
    ...actual,
    normalizePath: vi.fn((path: string) => path),
    logMessage: vi.fn(),
  };
});

describe("helper functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("safeMkdir", () => {
    it("should create directory with recursive option", async () => {
      await safeMkdir("/test/dir");

      expect(fs.mkdir).toHaveBeenCalledWith("/test/dir", { recursive: true });
    });

    it("should log when verbose is true", async () => {
      const { logMessage } = await import("../src/utils.ts");

      await safeMkdir("/test/dir", true, true);

      expect(logMessage).toHaveBeenCalledWith(
        "Creating dir: /test/dir (recursive: true)",
        true,
      );
    });

    it("should ignore EEXIST errors", async () => {
      const eexistError = new Error(
        "Directory exists",
      ) as NodeJS.ErrnoException;
      eexistError.code = "EEXIST";
      vi.mocked(fs.mkdir).mockRejectedValueOnce(eexistError);

      await expect(safeMkdir("/test/dir")).resolves.not.toThrow();
    });

    it("should throw non-EEXIST errors", async () => {
      const permissionError = new Error(
        "Permission denied",
      ) as NodeJS.ErrnoException;
      permissionError.code = "EACCES";
      vi.mocked(fs.mkdir).mockRejectedValueOnce(permissionError);

      await expect(safeMkdir("/test/dir")).rejects.toThrow("Permission denied");
    });

    it("should allow recursive to be disabled", async () => {
      await safeMkdir("/test/dir", false);

      expect(fs.mkdir).toHaveBeenCalledWith("/test/dir", { recursive: false });
    });
  });

  describe("simpleWrite", () => {
    it("should write content to file", async () => {
      await simpleWrite("/test/file.txt", "Hello World");

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/file.txt",
        "Hello World",
        "utf8",
      );
    });

    it("should log when verbose is true", async () => {
      const { logMessage } = await import("../src/utils.ts");

      await simpleWrite("/test/file.txt", "content", true);

      expect(logMessage).toHaveBeenCalledWith(
        "Writing to: /test/file.txt",
        true,
      );
    });

    it("should write to the provided path", async () => {
      await simpleWrite("/test/file.txt", "content");

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/file.txt",
        "content",
        "utf8",
      );
    });
  });

  describe("safeCopy", () => {
    it("should copy with recursive and force options", async () => {
      await safeCopy("/source/dir", "/dest/dir");

      expect(fs.cp).toHaveBeenCalledWith("/source/dir", "/dest/dir", {
        recursive: true,
        force: true,
      });
    });

    it("should log when verbose is true", async () => {
      const { logMessage } = await import("../src/utils.ts");

      await safeCopy("/source/dir", "/dest/dir", true);

      expect(logMessage).toHaveBeenCalledWith(
        "Copying /source/dir to /dest/dir",
        true,
      );
    });

    it("should copy from source to destination", async () => {
      await safeCopy("/source/dir", "/dest/dir");

      expect(fs.cp).toHaveBeenCalledWith("/source/dir", "/dest/dir", {
        recursive: true,
        force: true,
      });
    });
  });

  describe("previewAction", () => {
    it("should preview write action", () => {
      const action: FSAction = {
        type: "write",
        path: "/test/file.txt",
        content: "Hello World",
      };

      expect(previewAction(action)).toBe("[Write] /test/file.txt");
    });

    it("should preview mkdir action", () => {
      const action: FSAction = {
        type: "mkdir",
        path: "/test/directory",
      };

      expect(previewAction(action)).toBe("[Mkdir] /test/directory");
    });

    it("should preview copy action", () => {
      const action: FSAction = {
        type: "copy",
        from: "/source/file.txt",
        to: "/dest/file.txt",
      };

      expect(previewAction(action)).toBe(
        "[Copy] /source/file.txt -> /dest/file.txt",
      );
    });
  });
});

describe("executeActions - algorithm tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for fs.stat - assume directories exist
    vi.mocked(fs.stat).mockResolvedValue(
      {} as Awaited<ReturnType<typeof fs.stat>>,
    );
  });

  describe("dry-run mode", () => {
    it("should preview actions without executing them", async () => {
      const actions: FSAction[] = [
        { type: "mkdir", path: "/test/dir" },
        { type: "write", path: "/test/file.txt", content: "Hello" },
        { type: "copy", from: "/src/file.txt", to: "/dest/file.txt" },
      ];

      const result = await executeActions(actions, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toContain("/test/dir");
      expect(result.changes.written).toContain("/test/file.txt");
      expect(result.changes.copied).toContain("/dest/file.txt");

      // Verify no actual FS operations were called
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.cp).not.toHaveBeenCalled();
    });

    it("should log previews in verbose dry-run mode", async () => {
      const { logMessage } = await import("../src/utils.ts");
      const actions: FSAction[] = [{ type: "mkdir", path: "/test/dir" }];

      await executeActions(actions, { dryRun: true, verbose: true });

      expect(logMessage).toHaveBeenCalledWith(
        "[Dry-run] [Mkdir] /test/dir",
        true,
      );
    });
  });

  describe("action ordering", () => {
    it("should execute actions in correct order within groups", async () => {
      const executionOrder: string[] = [];

      vi.mocked(fs.mkdir).mockImplementation(async (path) => {
        executionOrder.push(`mkdir:${path}`);
      });
      vi.mocked(fs.cp).mockImplementation(async (from, to) => {
        executionOrder.push(`copy:${to}`);
      });
      vi.mocked(fs.writeFile).mockImplementation(async (path) => {
        executionOrder.push(`write:${path}`);
      });

      const actions: FSAction[] = [
        { type: "write", path: "/test/file.txt", content: "content" },
        { type: "copy", from: "/src", to: "/test/copied" },
        { type: "mkdir", path: "/test/dir" },
        // Different group
        { type: "write", path: "/other/file.txt", content: "content" },
        { type: "mkdir", path: "/other/dir" },
      ];

      await executeActions(actions, {});

      // With new grouping: mkdir operations are in their own groups
      // Group for /test has copy and write
      // Group for /test/dir has only mkdir
      const testFileOps = executionOrder.filter(
        (op) => op.includes("/test/file.txt") || op.includes("/test/copied"),
      );
      const testDirOp = executionOrder.filter((op) => op === "mkdir:/test/dir");

      // Group for /other has only write
      const otherFileOp = executionOrder.filter((op) =>
        op.includes("/other/file.txt"),
      );
      const otherDirOp = executionOrder.filter(
        (op) => op === "mkdir:/other/dir",
      );

      // Within the /test group, copy should come before write
      expect(testFileOps).toEqual([
        "copy:/test/copied",
        "write:/test/file.txt",
      ]);

      // Mkdir operations are in their own groups
      expect(testDirOp).toEqual(["mkdir:/test/dir"]);
      expect(otherFileOp).toEqual(["write:/other/file.txt"]);
      expect(otherDirOp).toEqual(["mkdir:/other/dir"]);
    });

    it("should sort groups lexicographically", async () => {
      const executionOrder: string[] = [];

      vi.mocked(fs.mkdir).mockImplementation(async (path) => {
        executionOrder.push(path as string);
      });

      const actions: FSAction[] = [
        { type: "mkdir", path: "/c/dir" },
        { type: "mkdir", path: "/a/dir" },
        { type: "mkdir", path: "/b/dir" },
      ];

      await executeActions(actions, {});

      expect(executionOrder).toEqual(["/a/dir", "/b/dir", "/c/dir"]);
    });
  });

  describe("dependency checking", () => {
    it("should check parent directory exists before write", async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      const actions: FSAction[] = [
        { type: "write", path: "/nonexistent/file.txt", content: "test" },
      ];

      await expect(executeActions(actions, {})).rejects.toThrow(
        "Missing parent directory for /nonexistent/file.txt",
      );
    });

    it("should not error if parent mkdir is in actions", async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      const actions: FSAction[] = [
        { type: "mkdir", path: "/parent" },
        { type: "write", path: "/parent/file.txt", content: "test" },
      ];

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toContain("/parent");
      expect(result.changes.written).toContain("/parent/file.txt");
    });

    it("should check parent directory for copy destination", async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      const actions: FSAction[] = [
        { type: "copy", from: "/src/file.txt", to: "/nonexistent/file.txt" },
      ];

      await expect(executeActions(actions, {})).rejects.toThrow(
        "Missing parent directory for /nonexistent/file.txt",
      );
    });
  });

  describe("error handling", () => {
    it("should fail fast on error", async () => {
      vi.mocked(fs.mkdir).mockImplementation(async (path) => {
        if (path === "/fail/dir") {
          throw new Error("Permission denied");
        }
      });

      const actions: FSAction[] = [
        { type: "mkdir", path: "/fail/dir" },
        { type: "mkdir", path: "/success/dir" },
      ];

      await expect(executeActions(actions, {})).rejects.toThrow(
        "Permission denied",
      );

      // Second mkdir should not have been called
      expect(fs.mkdir).toHaveBeenCalledTimes(1);
    });

    it("should fail on first error in any group", async () => {
      vi.mocked(fs.mkdir).mockImplementation(async (path) => {
        if ((path as string).includes("/fail")) {
          throw new Error("Failed");
        }
      });

      const actions: FSAction[] = [
        { type: "mkdir", path: "/fail/dir" },
        { type: "mkdir", path: "/success/dir" },
        { type: "write", path: "/fail/file.txt", content: "test" },
        { type: "write", path: "/success/file.txt", content: "test" },
      ];

      await expect(executeActions(actions, {})).rejects.toThrow("Failed");
    });
  });

  describe("execution tracking", () => {
    it("should track all successful operations", async () => {
      const actions: FSAction[] = [
        { type: "mkdir", path: "/test/dir1" },
        { type: "mkdir", path: "/test/dir2" },
        { type: "write", path: "/test/file1.txt", content: "content1" },
        { type: "write", path: "/test/file2.txt", content: "content2" },
        { type: "copy", from: "/src/file.txt", to: "/dest/file1.txt" },
        { type: "copy", from: "/src/file.txt", to: "/dest/file2.txt" },
      ];

      const result = await executeActions(actions, {});

      expect(result.success).toBe(true);
      expect(result.changes.createdDirs).toEqual(["/test/dir1", "/test/dir2"]);
      expect(result.changes.written).toEqual([
        "/test/file1.txt",
        "/test/file2.txt",
      ]);
      expect(result.changes.copied).toEqual([
        "/dest/file1.txt",
        "/dest/file2.txt",
      ]);
    });
  });

  describe("verbose logging", () => {
    it("should log operations when verbose is true", async () => {
      const { logMessage } = await import("../src/utils.ts");

      const actions: FSAction[] = [{ type: "mkdir", path: "/test/dir" }];

      await executeActions(actions, { verbose: true });

      expect(logMessage).toHaveBeenCalledWith(
        "Creating dir: /test/dir (recursive: true)",
        true,
      );
    });
  });

  describe("path normalization", () => {
    it("should normalize all paths upfront", async () => {
      const utils = await import("../src/utils.ts");
      const normalizePathMock = vi.mocked(utils.normalizePath);

      const actions: FSAction[] = [
        { type: "mkdir", path: "/test/../dir" },
        { type: "write", path: "/test/../file.txt", content: "test" },
        { type: "copy", from: "/source/../file", to: "/dest/../file" },
      ];

      await executeActions(actions, { dryRun: true });

      // Verify normalizePath was called for all paths
      expect(normalizePathMock).toHaveBeenCalledWith("/test/../dir");
      expect(normalizePathMock).toHaveBeenCalledWith("/test/../file.txt");
      expect(normalizePathMock).toHaveBeenCalledWith("/source/../file");
      expect(normalizePathMock).toHaveBeenCalledWith("/dest/../file");
    });
  });
});
