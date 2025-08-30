import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePath, isValidMdFile } from "../src/utils/paths.ts";
import { logMessage } from "../src/utils/logger.ts";
import { homedir } from "node:os";
import { resolve } from "node:path";

describe("utils", () => {
  describe("normalizePath", () => {
    const home = homedir();

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

    // Heavy security and root checks are covered by PathGuard tests.

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

    // The following cases are validated in path-guard.test.ts:
    // - traversal escapes
    // - safe .. that remain within roots
    // - prefix-evading paths
    // - symlink/realpath handling
  });

  describe("isValidMdFile", () => {
    it("should accept valid markdown files", () => {
      expect(isValidMdFile("test.md")).toBe(true);
      expect(isValidMdFile("README.md")).toBe(true);
      expect(isValidMdFile("path/to/file.md")).toBe(true);
    });

    it("should reject non-markdown files", () => {
      expect(isValidMdFile("test.txt")).toBe(false);
      expect(isValidMdFile("script.js")).toBe(false);
      expect(isValidMdFile("README")).toBe(false);
    });

    it("should accept valid markdown files regardless of case", () => {
      expect(isValidMdFile("test.MD")).toBe(true);
      expect(isValidMdFile("TEST.MD")).toBe(true);
      expect(isValidMdFile("file.mD")).toBe(true);
    });

    it("should handle edge cases", () => {
      expect(isValidMdFile(".md")).toBe(false); // File named just .md should be rejected
      expect(isValidMdFile("test.md.txt")).toBe(false);
      expect(isValidMdFile("test.markdown")).toBe(false);
    });

    it("should handle files with multiple dots", () => {
      expect(isValidMdFile("test.config.md")).toBe(true);
      expect(isValidMdFile("test.md.backup.md")).toBe(true);
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
