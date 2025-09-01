import { describe, it, expect } from "vitest";
import { normalizePath } from "./paths.js";
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
});
