import { describe, it, expect } from "vitest";
import { normalizePath } from "./paths.js";
import { homedir } from "node:os";
import path from "node:path";

describe("utilities", () => {
  describe("normalizePath", () => {
    const home = homedir();

    it("normalizes various path forms", () => {
      const cases = [
        {
          name: "home directory (~)",
          input: "~/test",
          expected: path.resolve(home, "test"),
        },
        {
          name: "home directory nested (~)",
          input: "~/Developer/project",
          expected: path.resolve(home, "Developer/project"),
        },
        {
          name: "absolute path",
          input: path.resolve(home, "Projects/my-app"),
          expected: path.resolve(home, "Projects/my-app"),
        },
        {
          name: "relative path",
          input: "./test",
          expected: path.resolve(process.cwd(), "test"),
        },
        {
          name: "multiple slashes",
          input: `${home}//Documents///project`,
          expected: path.resolve(home, "Documents/project"),
        },
      ] as const;

      for (const c of cases) {
        expect(normalizePath(c.input)).toBe(c.expected);
      }
    });

    it("does not expand ~user paths", () => {
      expect(normalizePath("~someone/config.json")).toBe(
        path.resolve("~someone/config.json"),
      );
    });
  });
});
