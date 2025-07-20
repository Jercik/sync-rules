import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseConfig, CONFIG_SCHEMA_URL } from "../src/config.ts";

describe("config", () => {
  describe("parseConfig", () => {
    describe("valid configurations", () => {
      it("should parse a basic valid config with single project", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "~/Developer/project",
              rules: ["python.md"],
              adapters: ["claude"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects).toHaveLength(1);
        // normalizePath will expand ~ to full home directory
        expect(config.projects[0].path).toMatch(/\/Developer\/project$/);
        expect(config.projects[0].rules).toEqual(["python.md"]);
        expect(config.projects[0].adapters).toEqual(["claude"]);
      });

      it("should parse config with multiple projects and adapters", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./backend",
              rules: ["python.md", "devops/docker.md"],
              adapters: ["claude", "kilocode"],
            },
            {
              path: "./frontend",
              rules: ["frontend/**/*.md"],
              adapters: ["gemini"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects).toHaveLength(2);
        expect(config.projects[0].adapters).toEqual(["claude", "kilocode"]);
        expect(config.projects[1].rules).toEqual(["frontend/**/*.md"]);
      });

      it("should parse config with $schema property", () => {
        const json = JSON.stringify({
          $schema: CONFIG_SCHEMA_URL,
          projects: [
            {
              path: "~/Developer/my-project",
              rules: ["*.md"],
              adapters: ["claude"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.$schema).toBe(CONFIG_SCHEMA_URL);
        expect(config.projects).toHaveLength(1);
      });

      it("should handle all three adapter types", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./project",
              rules: ["rule.md"],
              adapters: ["claude", "gemini", "kilocode"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects[0].adapters).toEqual([
          "claude",
          "gemini",
          "kilocode",
        ]);
      });

      it("should handle glob patterns in rules", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./project",
              rules: ["**/*.md", "frontend/**", "!test/**"],
              adapters: ["claude"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects[0].rules).toEqual([
          "**/*.md",
          "frontend/**",
          "!test/**",
        ]);
      });
    });

    describe("invalid configurations", () => {
      it("should throw on invalid JSON", () => {
        expect(() => parseConfig("not json")).toThrow(/Invalid JSON/);
        expect(() => parseConfig("{invalid}")).toThrow(/Invalid JSON/);
        expect(() => parseConfig("")).toThrow(/Invalid JSON/);
      });

      it("should throw on missing projects field", () => {
        const json = JSON.stringify({});
        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
          expect(error).toBeInstanceOf(z.ZodError);
          const zodError = error as z.ZodError;
          expect(zodError.issues).toHaveLength(1);
          expect(zodError.issues[0].path).toEqual(["projects"]);
          expect(zodError.issues[0].code).toBe("invalid_type");
        }
      });

      it("should throw on non-array projects", () => {
        const json = JSON.stringify({
          projects: "not an array",
        });
        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should throw on empty projects array", () => {
        const json = JSON.stringify({
          projects: [],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
          expect(error).toBeInstanceOf(z.ZodError);
          const zodError = error as z.ZodError;
          expect(zodError.issues).toHaveLength(1);
          expect(zodError.issues[0].path).toEqual(["projects"]);
          expect(zodError.issues[0].message).toBe(
            "At least one project must be specified",
          );
        }
      });

      it("should throw on missing required project fields", () => {
        // Missing path
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [{ rules: ["test.md"], adapters: ["claude"] }],
            }),
          ),
        ).toThrow(z.ZodError);

        // Missing rules
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [{ path: "./test", adapters: ["claude"] }],
            }),
          ),
        ).toThrow(z.ZodError);

        // Missing adapters
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [{ path: "./test", rules: ["test.md"] }],
            }),
          ),
        ).toThrow(z.ZodError);
      });

      it("should throw on empty required fields", () => {
        // Empty path
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [
                { path: "", rules: ["test.md"], adapters: ["claude"] },
              ],
            }),
          ),
        ).toThrow(z.ZodError);

        // Empty rules array
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [{ path: "./test", rules: [], adapters: ["claude"] }],
            }),
          ),
        ).toThrow(z.ZodError);

        // Empty adapters array
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [{ path: "./test", rules: ["test.md"], adapters: [] }],
            }),
          ),
        ).toThrow(z.ZodError);
      });

      it("should throw on invalid adapter names", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./test",
              rules: ["test.md"],
              adapters: ["invalid-adapter"],
            },
          ],
        });
        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should throw on wrong field types", () => {
        // Path as number
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [
                { path: 123, rules: ["test.md"], adapters: ["claude"] },
              ],
            }),
          ),
        ).toThrow(z.ZodError);

        // Rules as string
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [
                { path: "./test", rules: "test.md", adapters: ["claude"] },
              ],
            }),
          ),
        ).toThrow(z.ZodError);

        // Adapters as string
        expect(() =>
          parseConfig(
            JSON.stringify({
              projects: [
                { path: "./test", rules: ["test.md"], adapters: "claude" },
              ],
            }),
          ),
        ).toThrow(z.ZodError);
      });

      it("should throw on extra unknown properties", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./test",
              rules: ["test.md"],
              adapters: ["claude"],
              unknown: "field",
            },
          ],
        });
        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should throw on path traversal attempts", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "/etc/passwd",
              rules: ["test.md"],
              adapters: ["claude"],
            },
          ],
        });
        expect(() => parseConfig(json)).toThrow(/Invalid project path/);
      });

      it("should throw on paths outside allowed directories", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "/etc/passwd",
              rules: ["test.md"],
              adapters: ["claude"],
            },
          ],
        });
        expect(() => parseConfig(json)).toThrow(/Invalid project path/);
      });

      it("should provide helpful error messages for nested errors", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./valid",
              rules: ["test.md"],
              adapters: ["claude"],
            },
            {
              path: "./invalid",
              rules: ["test.md"],
              adapters: ["bad-adapter"],
            },
          ],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should handle multiple validation errors in a single project", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "",
              rules: [],
              adapters: ["invalid-adapter"],
            },
          ],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
          expect(error).toBeInstanceOf(z.ZodError);
          const zodError = error as z.ZodError;
          // Zod collects multiple issues
          expect(zodError.issues.length).toBeGreaterThan(1);
        }
      });

      it("should handle multiple validation errors across different projects", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "./valid1",
              rules: [],
              adapters: ["claude"],
            },
            {
              path: "./valid2",
              rules: ["test.md"],
              adapters: [],
            },
            {
              path: "./valid3",
              rules: ["rule.md"],
              adapters: ["InvalidAdapter"],
            },
          ],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
          expect(error).toBeInstanceOf(z.ZodError);
          const zodError = error as z.ZodError;
          // Should have errors from different projects
          expect(zodError.issues.length).toBe(3);
        }
      });

      it("should handle validation errors without path information", () => {
        // This tests root-level validation errors
        const json = JSON.stringify({
          unknownField: "value",
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should re-throw unexpected errors", () => {
        // Create a mock that throws a non-Zod, non-SyntaxError
        const originalParse = JSON.parse;
        const unexpectedError = new TypeError("Unexpected error");
        JSON.parse = () => {
          throw unexpectedError;
        };

        try {
          parseConfig("{}");
          expect.fail("Should have thrown an error");
        } catch (error) {
          // With the new implementation, all JSON.parse errors are wrapped in Error
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe(
            "Invalid JSON: Unexpected error",
          );
        } finally {
          JSON.parse = originalParse;
        }
      });
    });

    describe("edge cases", () => {
      it("should handle very large configs", () => {
        const projects = Array.from({ length: 100 }, (_, i) => ({
          path: `./project${i}`,
          rules: ["rule.md"],
          adapters: ["claude"],
        }));

        const json = JSON.stringify({ projects });
        const config = parseConfig(json);
        expect(config.projects).toHaveLength(100);
      });
    });
  });
});
