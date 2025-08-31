import { describe, it, expect, beforeEach } from "vitest";
import {
  createPathGuard,
  createPathGuardForPlannedWrites,
  type PathGuard,
} from "./path-guard.js";
import { homedir } from "node:os";
import { resolve } from "node:path";

describe("PathGuard", () => {
  const home = homedir();
  const testRoot = "/test/root";

  describe("createPathGuard", () => {
    it("should create guard with valid allowed roots", () => {
      const guard = createPathGuard([home, testRoot]);
      expect(guard).toBeDefined();
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should throw error if no allowed roots provided", () => {
      expect(() => createPathGuard([])).toThrow(
        "At least one allowed root directory must be provided",
      );
    });

    it("should throw error if allowed root is not absolute path", () => {
      expect(() => createPathGuard(["./relative/path"])).toThrow(
        "Allowed root must be an absolute path: ./relative/path",
      );
    });

    it("should normalize allowed roots", () => {
      const guard = createPathGuard(["/test//root//", "/another///root"]);
      const roots = guard.getAllowedRoots();
      expect(roots).toContain("/test/root");
      expect(roots).toContain("/another/root");
    });
  });

  describe("validatePath", () => {
    let guard: PathGuard;

    beforeEach(() => {
      guard = createPathGuard([home, testRoot, process.cwd()]);
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
      guard = createPathGuard([home, testRoot]);
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
      const guard = createPathGuard([home, testRoot]);
      const roots = guard.getAllowedRoots();

      expect(roots).toHaveLength(2);
      expect(roots).toContain(home);
      expect(roots).toContain(testRoot);

      // Verify it's a copy, not the original array
      roots.push("/new/root");
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });

    it("should maintain immutability of roots", () => {
      const originalRoots = [home, testRoot];
      const guard = createPathGuard(originalRoots);

      // Modifying the original array should not affect the guard
      originalRoots.push("/another/root");
      expect(guard.getAllowedRoots()).toHaveLength(2);

      // Getting roots and modifying them should not affect the guard
      const retrievedRoots = guard.getAllowedRoots();
      retrievedRoots.push("/yet/another/root");
      expect(guard.getAllowedRoots()).toHaveLength(2);
    });
  });

  describe("integration scenarios", () => {
    it("should handle complex path traversal attempts", () => {
      const guard = createPathGuard(["/safe/root"]);

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

    it("should respect immutable roots", () => {
      const guard = createPathGuard([home]);

      // Path outside home should be rejected
      expect(() => guard.validatePath("/new/root/file.txt")).toThrow(
        "Path is outside allowed directories",
      );

      // Create a new guard with additional roots for different validation rules
      const guardWithNewRoot = createPathGuard([home, "/new/root"]);
      expect(guardWithNewRoot.validatePath("/new/root/file.txt")).toBe(
        "/new/root/file.txt",
      );

      // Original guard should still reject the path (immutable)
      expect(() => guard.validatePath("/new/root/file.txt")).toThrow(
        "Path is outside allowed directories",
      );
    });
  });

  describe("simplified path validation", () => {
    it("should allow legitimate non-existent files in allowed directories", () => {
      const guard = createPathGuard(["/test/root"]);

      // Creating new files under allowed root should be allowed
      const result = guard.validatePath("/test/root/newdir/newfile.txt");
      expect(result).toBe("/test/root/newdir/newfile.txt");
    });

    it("should properly handle deeply nested non-existent paths", () => {
      const guard = createPathGuard(["/test/root"]);

      // Multiple levels of non-existent directories
      const deepPath = "/test/root/level1/level2/level3/file.txt";
      const result = guard.validatePath(deepPath);
      expect(result).toBe(deepPath);
    });

    it("should allow paths for completely non-existent allowed roots", () => {
      const guard = createPathGuard(["/completely/nonexistent/path"]);

      // This should succeed since path is logically within allowed roots
      const result = guard.validatePath(
        "/completely/nonexistent/path/file.txt",
      );
      expect(result).toBe("/completely/nonexistent/path/file.txt");
    });

    it("should reject paths outside allowed roots using logical checking", () => {
      const guard = createPathGuard(["/test/root"]);

      // Paths outside allowed root should be rejected
      expect(() => guard.validatePath("/safe/parent/newfile.txt")).toThrow(
        "Path is outside allowed directories",
      );
    });
  });

  describe("createPathGuardForPlannedWrites", () => {
    it("should only allow exact planned paths", () => {
      const plannedPaths = [
        "/project/file1.ts",
        "/project/src/file2.ts",
        "/project/config.json",
      ];
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      // Should allow exact planned paths
      expect(guard.validatePath("/project/file1.ts")).toBe("/project/file1.ts");
      expect(guard.validatePath("/project/src/file2.ts")).toBe(
        "/project/src/file2.ts",
      );
      expect(guard.validatePath("/project/config.json")).toBe(
        "/project/config.json",
      );

      // Should reject any path not in the planned list
      expect(() => guard.validatePath("/project/file3.ts")).toThrow(
        "Path not in planned writes",
      );
      expect(() => guard.validatePath("/project/src/other.ts")).toThrow(
        "Path not in planned writes",
      );
      expect(() => guard.validatePath("/project/")).toThrow(
        "Path not in planned writes",
      );
    });

    it("should normalize paths before comparison", () => {
      const plannedPaths = ["/project/src/../file.ts"]; // Will normalize to /project/file.ts
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      // Should match normalized path
      expect(guard.validatePath("/project/file.ts")).toBe("/project/file.ts");
      expect(guard.validatePath("/project/./file.ts")).toBe("/project/file.ts");
    });

    it("should reject empty path list", () => {
      expect(() => createPathGuardForPlannedWrites([])).toThrow(
        "At least one planned path must be provided",
      );
    });

    it("should handle tilde expansion in planned paths", () => {
      const homedir =
        process.env.HOME || process.env.USERPROFILE || "/home/user";
      const plannedPaths = ["~/project/file.ts"];
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      // Should expand and match tilde paths
      expect(guard.validatePath("~/project/file.ts")).toBe(
        `${homedir}/project/file.ts`,
      );
    });

    it("should return planned paths as allowed roots", () => {
      const plannedPaths = ["/project/file1.ts", "/project/file2.ts"];
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      const roots = guard.getAllowedRoots();
      expect(roots).toHaveLength(2);
      expect(roots).toContain("/project/file1.ts");
      expect(roots).toContain("/project/file2.ts");
    });

    it("should check exact path matches with isInsideAllowedRoot", () => {
      const plannedPaths = ["/project/file1.ts", "/project/src/file2.ts"];
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      // Only exact matches should return true
      expect(guard.isInsideAllowedRoot("/project/file1.ts")).toBe(true);
      expect(guard.isInsideAllowedRoot("/project/src/file2.ts")).toBe(true);

      // Non-matches should return false
      expect(guard.isInsideAllowedRoot("/project/file3.ts")).toBe(false);
      expect(guard.isInsideAllowedRoot("/project/")).toBe(false);
      expect(guard.isInsideAllowedRoot("/project/src/")).toBe(false);
    });

    it("should be immutable", () => {
      const plannedPaths = ["/project/file1.ts"];
      const guard = createPathGuardForPlannedWrites(plannedPaths);

      // Guard should be frozen
      expect(Object.isFrozen(guard)).toBe(true);

      // Getting allowed roots should return a copy
      const roots1 = guard.getAllowedRoots();
      const roots2 = guard.getAllowedRoots();
      expect(roots1).not.toBe(roots2);
      expect(roots1).toEqual(roots2);
    });
  });
});
