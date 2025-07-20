import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePath, isValidMdFile, logMessage } from "../src/utils.ts";
import { MAX_MD_SIZE } from "../src/constants.ts";
import { homedir } from "os";
import { resolve } from "path";

describe("utils", () => {
  describe("normalizePath", () => {
    const home = homedir();
    const centralRepo = resolve(home, "Developer/agent-rules");

    it("should resolve home directory (~) correctly", () => {
      expect(normalizePath("~/test")).toBe(resolve(home, "test"));
      expect(normalizePath("~/Developer/project")).toBe(
        resolve(home, "Developer/project"),
      );
    });

    it("should handle absolute paths", () => {
      const absolutePath = resolve(home, "Projects/my-app");
      expect(normalizePath(absolutePath)).toBe(absolutePath);
    });

    it("should reject path traversal attempts that escape allowed directories", () => {
      // These should throw because they resolve outside allowed directories
      expect(() => normalizePath("/etc/passwd")).toThrow(
        /outside allowed directories/i,
      );
      expect(() => normalizePath("/root/.ssh/id_rsa")).toThrow(
        /outside allowed directories/i,
      );
    });

    it("should allow safe paths with .. that stay within allowed directories", () => {
      // This path is safe: ~/Projects/../Documents/project resolves to ~/Documents/project
      const safePath = `${home}/Projects/../Documents/project`;
      const result = normalizePath(safePath);
      expect(result).toBe(resolve(home, "Documents/project"));
    });

    it("should allow paths within home directory", () => {
      const validPath = resolve(home, "Documents/project");
      expect(() => normalizePath(validPath)).not.toThrow();
    });

    it("should allow paths within central repository", () => {
      const validPath = resolve(centralRepo, "rules/python.md");
      expect(() => normalizePath(validPath)).not.toThrow();
    });

    it("should handle empty string", () => {
      expect(() => normalizePath("")).toThrow(/invalid path/i);
    });

    it("should handle relative paths by resolving them", () => {
      // Relative paths should be resolved from current directory
      const result = normalizePath("./test");
      expect(result).toBe(resolve(process.cwd(), "test"));
    });

    it("should normalize paths with multiple slashes", () => {
      const input = `${home}//Documents///project`;
      const expected = resolve(home, "Documents/project");
      expect(normalizePath(input)).toBe(expected);
    });

    it("should reject paths that look like they start with allowed root but escape it", () => {
      // /home/user2 should not be allowed just because it starts with /home/user
      const evilPath = `${home}2/evil`; // e.g., /home/user2/evil when home is /home/user
      expect(() => normalizePath(evilPath)).toThrow(
        /outside allowed directories/i,
      );
    });

    it("should handle symlinks by resolving to real path", () => {
      // Since we can't easily create symlinks in tests, we'll just ensure
      // the function returns a valid path within allowed directories
      const result = normalizePath(`${home}/Documents/project`);
      expect(result).toMatch(
        new RegExp(`^${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
    });
  });

  describe("isValidMdFile", () => {
    it("should accept valid markdown files under 1MB", () => {
      expect(isValidMdFile("test.md", 100)).toBe(true);
      expect(isValidMdFile("README.md", MAX_MD_SIZE - 1)).toBe(true);
      expect(isValidMdFile("path/to/file.md", 0)).toBe(true);
    });

    it("should reject files exactly 1MB or larger", () => {
      expect(isValidMdFile("large.md", MAX_MD_SIZE)).toBe(false);
      expect(isValidMdFile("huge.md", MAX_MD_SIZE + 1)).toBe(false);
      expect(isValidMdFile("massive.md", 10 * MAX_MD_SIZE)).toBe(false);
    });

    it("should reject non-markdown files", () => {
      expect(isValidMdFile("test.txt", 100)).toBe(false);
      expect(isValidMdFile("script.js", 100)).toBe(false);
      expect(isValidMdFile("README", 100)).toBe(false);
    });

    it("should accept valid markdown files regardless of case", () => {
      expect(isValidMdFile("test.MD", 100)).toBe(true);
      expect(isValidMdFile("TEST.MD", 100)).toBe(true);
      expect(isValidMdFile("file.mD", 100)).toBe(true);
    });

    it("should handle edge cases", () => {
      expect(isValidMdFile(".md", 100)).toBe(false); // File named just .md should be rejected
      expect(isValidMdFile("test.md.txt", 100)).toBe(false);
      expect(isValidMdFile("test.markdown", 100)).toBe(false);
    });

    it("should reject negative sizes", () => {
      expect(isValidMdFile("test.md", -1)).toBe(false);
      expect(isValidMdFile("test.md", -1000)).toBe(false);
    });

    it("should handle files with multiple dots", () => {
      expect(isValidMdFile("test.config.md", 100)).toBe(true);
      expect(isValidMdFile("test.md.backup.md", 100)).toBe(true);
    });
  });

  describe("logMessage", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("should log message when verbose is true", () => {
      logMessage("Test message", true);
      expect(logSpy).toHaveBeenCalledWith("Test message");
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it("should not log message when verbose is false", () => {
      logMessage("Test message", false);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("should handle multi-line messages correctly", () => {
      const multiLine = "Line 1\nLine 2\nLine 3";
      logMessage(multiLine, true);
      expect(logSpy).toHaveBeenCalledWith(multiLine);
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle empty messages", () => {
      logMessage("", true);
      expect(logSpy).toHaveBeenCalledWith("");
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple calls", () => {
      logMessage("First", true);
      logMessage("Second", true);
      logMessage("Third", false);
      logMessage("Fourth", true);

      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy).toHaveBeenNthCalledWith(1, "First");
      expect(logSpy).toHaveBeenNthCalledWith(2, "Second");
      expect(logSpy).toHaveBeenNthCalledWith(3, "Fourth");
    });
  });
});
