import { describe, it, expect, beforeEach, vi } from "vitest";
import { PathGuard, createDefaultPathGuard } from "../src/pathGuard.ts";
import { homedir } from "os";
import { resolve } from "path";
import * as fs from "fs";

// Mock fs module for symlink tests
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof fs>("fs");
  return {
    ...actual,
    realpathSync: vi.fn((path: string) => {
      // Simulate symlink resolution for specific test cases
      if (path.includes("/symlink/")) {
        throw new Error("ENOENT");
      }
      return path;
    }),
  };
});

describe("PathGuard", () => {
  const home = homedir();
  const testRoot = "/test/root";
  const anotherRoot = "/another/root";

  describe("constructor", () => {
    it("should create instance with valid allowed roots", () => {
      const guard = new PathGuard([home, testRoot]);
      expect(guard).toBeInstanceOf(PathGuard);
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should throw error if no allowed roots provided", () => {
      expect(() => new PathGuard([])).toThrow(
        "At least one allowed root directory must be provided",
      );
    });

    it("should throw error if allowed root is not absolute path", () => {
      expect(() => new PathGuard(["./relative/path"])).toThrow(
        "Allowed root must be an absolute path: ./relative/path",
      );
    });

    it("should normalize allowed roots", () => {
      const guard = new PathGuard(["/test//root//", "/another///root"]);
      const roots = guard.getAllowedRoots();
      expect(roots).toContain("/test/root");
      expect(roots).toContain("/another/root");
    });
  });

  describe("validatePath", () => {
    let guard: PathGuard;

    beforeEach(() => {
      guard = new PathGuard([home, testRoot, process.cwd()]);
    });

    it("should validate paths within allowed roots", () => {
      const validPath = resolve(home, "Documents/project");
      expect(guard.validatePath(validPath)).toBe(validPath);
    });

    it("should expand tilde (~) to home directory", () => {
      const result = guard.validatePath("~/Documents/project");
      expect(result).toBe(resolve(home, "Documents/project"));
    });

    it("should throw error for empty path", () => {
      expect(() => guard.validatePath("")).toThrow(
        "Invalid path: empty string",
      );
      expect(() => guard.validatePath("   ")).toThrow(
        "Invalid path: empty string",
      );
    });

    it("should throw error for paths outside allowed roots", () => {
      expect(() => guard.validatePath("/etc/passwd")).toThrow(
        "Path is outside allowed directories",
      );
      expect(() => guard.validatePath("/root/.ssh/id_rsa")).toThrow(
        "Path is outside allowed directories",
      );
    });

    it("should handle relative paths by resolving from cwd", () => {
      const result = guard.validatePath("./test/file.md");
      expect(result).toBe(resolve(process.cwd(), "test/file.md"));
    });

    it("should normalize paths with multiple slashes", () => {
      const input = `${home}//Documents///project`;
      const expected = resolve(home, "Documents/project");
      expect(guard.validatePath(input)).toBe(expected);
    });

    it("should allow safe paths with .. that stay within allowed roots", () => {
      const safePath = `${home}/Projects/../Documents/project`;
      const result = guard.validatePath(safePath);
      expect(result).toBe(resolve(home, "Documents/project"));
    });

    it("should reject paths that escape allowed roots using ..", () => {
      expect(() => guard.validatePath(`${home}/../../etc/passwd`)).toThrow(
        "Path is outside allowed directories",
      );
    });

    it("should handle non-existent paths (for file creation)", () => {
      const newFilePath = `${home}/new-file-that-does-not-exist.md`;
      expect(() => guard.validatePath(newFilePath)).not.toThrow();
    });

    it("should reject paths that look like they start with allowed root but escape it", () => {
      const evilPath = `${home}2/evil`; // e.g., /home/user2/evil when home is /home/user
      expect(() => guard.validatePath(evilPath)).toThrow(
        "Path is outside allowed directories",
      );
    });
  });

  describe("isInsideAllowedRoot", () => {
    let guard: PathGuard;

    beforeEach(() => {
      guard = new PathGuard([home, testRoot]);
    });

    it("should return true for paths inside allowed roots", () => {
      expect(guard.isInsideAllowedRoot(resolve(home, "Documents"))).toBe(true);
      expect(
        guard.isInsideAllowedRoot(resolve(testRoot, "subdir/file.txt")),
      ).toBe(true);
    });

    it("should return false for paths outside allowed roots", () => {
      expect(guard.isInsideAllowedRoot("/etc/passwd")).toBe(false);
      expect(guard.isInsideAllowedRoot("/usr/bin/node")).toBe(false);
    });

    it("should return true for the exact root path", () => {
      expect(guard.isInsideAllowedRoot(home)).toBe(true);
      expect(guard.isInsideAllowedRoot(testRoot)).toBe(true);
    });

    it("should handle edge cases with similar paths", () => {
      // Path that starts with allowed root string but is actually outside
      expect(guard.isInsideAllowedRoot(`${home}2/file`)).toBe(false);
      expect(guard.isInsideAllowedRoot(`${testRoot}-other/file`)).toBe(false);
    });
  });

  describe("getAllowedRoots", () => {
    it("should return a copy of allowed roots", () => {
      const guard = new PathGuard([home, testRoot]);
      const roots = guard.getAllowedRoots();

      expect(roots).toHaveLength(2);
      expect(roots).toContain(home);
      expect(roots).toContain(testRoot);

      // Verify it's a copy, not the original array
      roots.push("/new/root");
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });
  });

  describe("addAllowedRoot", () => {
    let guard: PathGuard;

    beforeEach(() => {
      guard = new PathGuard([home]);
    });

    it("should add new allowed root", () => {
      guard.addAllowedRoot(testRoot);
      expect(guard.getAllowedRoots()).toContain(testRoot);
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should not add duplicate roots", () => {
      guard.addAllowedRoot(testRoot);
      guard.addAllowedRoot(testRoot);
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should normalize new roots", () => {
      guard.addAllowedRoot("/test//root//");
      expect(guard.getAllowedRoots()).toContain("/test/root");
    });

    it("should throw error for relative paths", () => {
      expect(() => guard.addAllowedRoot("./relative")).toThrow(
        "Allowed root must be an absolute path: ./relative",
      );
    });
  });

  describe("removeAllowedRoot", () => {
    let guard: PathGuard;

    beforeEach(() => {
      guard = new PathGuard([home, testRoot, anotherRoot]);
    });

    it("should remove existing root and return true", () => {
      expect(guard.removeAllowedRoot(testRoot)).toBe(true);
      expect(guard.getAllowedRoots()).not.toContain(testRoot);
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should return false if root not found", () => {
      expect(guard.removeAllowedRoot("/non/existent")).toBe(false);
      expect(guard.getAllowedRoots()).toHaveLength(3);
    });

    it("should handle normalized paths", () => {
      expect(guard.removeAllowedRoot("/test//root//")).toBe(true);
      expect(guard.getAllowedRoots()).not.toContain(testRoot);
    });

    it("should allow removing all but one root", () => {
      guard.removeAllowedRoot(testRoot);
      guard.removeAllowedRoot(anotherRoot);
      expect(guard.getAllowedRoots()).toHaveLength(1);
      expect(guard.getAllowedRoots()).toContain(home);
    });
  });

  describe("createDefaultPathGuard", () => {
    it("should create guard with default roots", () => {
      const guard = createDefaultPathGuard();
      const roots = guard.getAllowedRoots();

      expect(roots).toContain(homedir());
      expect(roots).toContain(process.cwd());
      expect(roots).toContain(resolve(homedir(), "Developer/agent-rules"));
    });

    it("should include additional roots if provided", () => {
      const additionalRoots = ["/custom/root1", "/custom/root2"];
      const guard = createDefaultPathGuard(additionalRoots);
      const roots = guard.getAllowedRoots();

      expect(roots).toContain("/custom/root1");
      expect(roots).toContain("/custom/root2");
      expect(roots.length).toBeGreaterThanOrEqual(5); // 3 defaults + 2 additional
    });
  });

  describe("integration scenarios", () => {
    it("should handle complex path traversal attempts", () => {
      const guard = new PathGuard(["/safe/root"]);

      // Various traversal attempts
      const attacks = [
        "/safe/root/../../../etc/passwd",
        "/safe/root/./../../etc/passwd",
        "/safe/root/subdir/../../../../../../etc/passwd",
        "../../../etc/passwd",
      ];

      for (const attack of attacks) {
        expect(() => guard.validatePath(attack)).toThrow(
          "Path is outside allowed directories",
        );
      }
    });

    it("should validate paths after adding new roots", () => {
      const guard = new PathGuard([home]);

      // Initially reject path outside home
      expect(() => guard.validatePath("/new/root/file.txt")).toThrow();

      // Add new root and verify path is now valid
      guard.addAllowedRoot("/new/root");
      expect(guard.validatePath("/new/root/file.txt")).toBe(
        "/new/root/file.txt",
      );
    });

    it("should invalidate paths after removing roots", () => {
      const guard = new PathGuard([home, "/removable/root"]);

      // Initially accept path
      expect(guard.validatePath("/removable/root/file.txt")).toBe(
        "/removable/root/file.txt",
      );

      // Remove root and verify path is now invalid
      guard.removeAllowedRoot("/removable/root");
      expect(() => guard.validatePath("/removable/root/file.txt")).toThrow(
        "Path is outside allowed directories",
      );
    });
  });
});
