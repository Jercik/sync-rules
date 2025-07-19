import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePath, isValidMdFile, logMessage } from "../src/utils.ts";
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

    it("should reject path traversal attempts", () => {
      expect(() => normalizePath("../evil")).toThrow(/path traversal/i);
      expect(() => normalizePath("../../etc/passwd")).toThrow(
        /path traversal/i,
      );
      expect(() => normalizePath("~/../../root")).toThrow(/path traversal/i);
    });

    it("should reject paths outside allowed roots", () => {
      expect(() => normalizePath("/etc/passwd")).toThrow(
        /outside allowed directories/i,
      );
      expect(() => normalizePath("/usr/bin/node")).toThrow(
        /outside allowed directories/i,
      );
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
  });

  describe("isValidMdFile", () => {
    it("should accept valid markdown files under 1MB", () => {
      expect(isValidMdFile("test.md", 100)).toBe(true);
      expect(isValidMdFile("README.md", 1024 * 1024 - 1)).toBe(true);
      expect(isValidMdFile("path/to/file.md", 0)).toBe(true);
    });

    it("should reject files exactly 1MB or larger", () => {
      expect(isValidMdFile("large.md", 1024 * 1024)).toBe(false);
      expect(isValidMdFile("huge.md", 1024 * 1024 + 1)).toBe(false);
      expect(isValidMdFile("massive.md", 10 * 1024 * 1024)).toBe(false);
    });

    it("should reject non-markdown files", () => {
      expect(isValidMdFile("test.txt", 100)).toBe(false);
      expect(isValidMdFile("script.js", 100)).toBe(false);
      expect(isValidMdFile("README", 100)).toBe(false);
      expect(isValidMdFile("test.MD", 100)).toBe(false); // Case sensitive
    });

    it("should handle edge cases", () => {
      expect(isValidMdFile(".md", 100)).toBe(true); // File named just .md
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
