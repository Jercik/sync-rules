import { describe, it, expect } from "vitest";
import { validatePathSecurity } from "../../../src/utils/core.ts";
import path from "node:path";

describe("validatePathSecurity", () => {
  const baseDir = "/home/user/projects";

  it("should allow valid paths within base directory", () => {
    expect(validatePathSecurity("project1", baseDir)).toBe(
      path.normalize("/home/user/projects/project1").replace(/\\/g, "/")
    );
    
    expect(validatePathSecurity("./project1", baseDir)).toBe(
      path.normalize("/home/user/projects/project1").replace(/\\/g, "/")
    );
    
    expect(validatePathSecurity("subdir/project1", baseDir)).toBe(
      path.normalize("/home/user/projects/subdir/project1").replace(/\\/g, "/")
    );
  });

  it("should allow current directory reference", () => {
    expect(validatePathSecurity(".", baseDir)).toBe(
      path.normalize("/home/user/projects").replace(/\\/g, "/")
    );
    
    expect(validatePathSecurity("", baseDir)).toBe(
      path.normalize("/home/user/projects").replace(/\\/g, "/")
    );
  });

  it("should block path traversal attempts", () => {
    expect(() => validatePathSecurity("../", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("../../etc/passwd", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("../../../", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("./../../secret", baseDir))
      .toThrow(/Path traversal attempt detected/);
  });

  it("should block complex traversal attempts", () => {
    // project1/../../ goes up two levels from baseDir
    expect(() => validatePathSecurity("project1/../../", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("project1/../../../etc", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("./valid/../../../etc/passwd", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    // This resolves to base directory itself
    expect(() => validatePathSecurity("project1/..", baseDir))
      .toThrow(/Invalid path.*resolves to the base directory itself/);
  });

  it("should handle Windows-style paths", () => {
    const winBaseDir = process.platform === 'win32' 
      ? "C:\\Users\\user\\projects"
      : "/Users/user/projects"; // Use Unix path on non-Windows
    
    expect(validatePathSecurity("project1", winBaseDir)).toBe(
      path.resolve(winBaseDir, "project1").replace(/\\/g, "/")
    );
    
    // On Windows, backslashes are path separators; on Unix, they're part of filename
    if (process.platform === 'win32') {
      expect(() => validatePathSecurity("..\\..\\Windows\\System32", winBaseDir))
        .toThrow(/Path traversal attempt detected/);
    } else {
      // On Unix, backslashes are treated as literal characters in filenames
      // The path resolves to a file/directory with backslashes in the name
      const result = validatePathSecurity("..\\..\\Windows\\System32", winBaseDir);
      expect(result).toBe(
        path.normalize(winBaseDir + "/..\\..\\Windows\\System32").replace(/\\/g, "/")
      );
    }
  });

  it("should handle absolute paths that try to escape", () => {
    expect(() => validatePathSecurity("/etc/passwd", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    expect(() => validatePathSecurity("/home/user/other", baseDir))
      .toThrow(/Path traversal attempt detected/);
  });

  it("should block URL-encoded path traversal attempts", () => {
    // %2e%2e is URL-encoded ".."
    // %2f is URL-encoded "/"
    // %2e%2e%2f = "../"
    expect(() => validatePathSecurity("%2e%2e%2f", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    // %2e%2e%2f%2e%2e%2fetc = "../../etc"
    expect(() => validatePathSecurity("%2e%2e%2f%2e%2e%2fetc", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    // Mixed encoding: %2e%2e/../etc
    expect(() => validatePathSecurity("%2e%2e/../etc", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    // Double-encoded: %252e%252e%252f = %2e%2e%2f after first decode = "../" after second
    expect(() => validatePathSecurity("%252e%252e%252f", baseDir))
      .toThrow(/Path traversal attempt detected/);
    
    // Valid URL-encoded path should still work
    const validEncoded = "project%201"; // "project 1"
    expect(validatePathSecurity(validEncoded, baseDir)).toBe(
      path.normalize("/home/user/projects/project 1").replace(/\\/g, "/")
    );
  });

  it("should handle nested valid paths", () => {
    const deepPath = "level1/level2/level3/project";
    expect(validatePathSecurity(deepPath, baseDir)).toBe(
      path.normalize("/home/user/projects/level1/level2/level3/project").replace(/\\/g, "/")
    );
  });

  it("should block attempts using null bytes", () => {
    // Null bytes used to terminate strings in C
    expect(() => validatePathSecurity("valid\x00/../../../etc/passwd", baseDir))
      .toThrow(/Path traversal attempt detected/);
  });
});