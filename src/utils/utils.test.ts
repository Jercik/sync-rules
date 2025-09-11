import { describe, it, expect } from "vitest";
import { normalizePath } from "./paths.js";
import { homedir } from "node:os";
import { resolve } from "node:path";

describe("utils", () => {
  describe("normalizePath", () => {
    const home = homedir();

    it("normalizes various path forms", () => {
      const cases = [
        {
          name: "home directory (~)",
          input: "~/test",
          expected: resolve(home, "test"),
        },
        {
          name: "home directory nested (~)",
          input: "~/Developer/project",
          expected: resolve(home, "Developer/project"),
        },
        {
          name: "absolute path",
          input: resolve(home, "Projects/my-app"),
          expected: resolve(home, "Projects/my-app"),
        },
        {
          name: "relative path",
          input: "./test",
          expected: resolve(process.cwd(), "test"),
        },
        {
          name: "multiple slashes",
          input: `${home}//Documents///project`,
          expected: resolve(home, "Documents/project"),
        },
      ] as const;

      for (const c of cases) {
        expect(normalizePath(c.input)).toBe(c.expected);
      }
    });
  });
});
