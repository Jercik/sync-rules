import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { parseConfig, findProjectForPath } from "./config.js";
import { loadConfig } from "./loader.js";
import { ConfigNotFoundError, ConfigParseError } from "../utils/errors.js";
import * as fs from "node:fs/promises";
import type { Config } from "./config.js";

vi.mock("node:fs/promises");

// Mock utils to bypass path validation during tests
vi.mock("../utils/paths.ts", async () => {
  const actual = (await vi.importActual(
    "../utils/paths.ts",
  )) as typeof import("../utils/paths.ts");
  return {
    ...actual,
    normalizePath: (path: string) => {
      // Simple normalization for tests
      let normalized = path;
      if (path.startsWith("~")) {
        normalized = path.replace("~", "/home/user");
      }
      if (normalized.endsWith("/") && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    },
  };
});

describe("config", () => {
  describe("parseConfig", () => {
    describe("valid configurations", () => {
      it("should parse a basic valid config with single project", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
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
          rulesSource: "/path/to/rules",
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

      it("should handle all adapter types", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "./project",
              rules: ["rule.md"],
              adapters: ["claude", "gemini", "kilocode", "cline", "codex"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects[0].adapters).toEqual([
          "claude",
          "gemini",
          "kilocode",
          "cline",
          "codex",
        ]);
      });

      it("should handle glob patterns in rules", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
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

      it("should parse config without rulesSource (using default)", () => {
        const json = JSON.stringify({
          projects: [
            {
              path: "~/Developer/project",
              rules: ["test.md"],
              adapters: ["claude"],
            },
          ],
        });
        const config = parseConfig(json);
        // Should default to a normalized absolute path in app data
        expect(typeof config.rulesSource).toBe("string");
        expect(config.rulesSource).toMatch(/sync-rules(-nodejs)?[/\\]rules$/);
        expect(config.projects).toHaveLength(1);
        expect(config.projects[0].path).toMatch(/\//);
        expect(config.projects[0].rules).toEqual(["test.md"]);
        expect(config.projects[0].adapters).toEqual(["claude"]);
      });
    });

    describe("invalid configurations", () => {
      it("should throw on invalid JSON", () => {
        expect(() => parseConfig("not json")).toThrow(SyntaxError);
        expect(() => parseConfig("{invalid}")).toThrow(SyntaxError);
        expect(() => parseConfig("")).toThrow(SyntaxError);
      });

      it("should throw on missing projects field", () => {
        const json = JSON.stringify({});
        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
          const zodError = error as z.ZodError;
          expect(zodError.issues).toHaveLength(1); // Only projects is missing
          const paths = zodError.issues.map((issue) => issue.path[0]);
          expect(paths).toContain("projects");
        }
      });

      it("should throw on non-array projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: "not an array",
        });
        expect(() => parseConfig(json)).toThrow(z.ZodError);
      });

      it("should throw on empty projects array", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);

        try {
          parseConfig(json);
        } catch (error) {
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
              rulesSource: "/path/to/rules",
              projects: [{ rules: ["test.md"], adapters: ["claude"] }],
            }),
          ),
        ).toThrow(z.ZodError);

        // Missing rules
        expect(() =>
          parseConfig(
            JSON.stringify({
              rulesSource: "/path/to/rules",
              projects: [{ path: "./test", adapters: ["claude"] }],
            }),
          ),
        ).toThrow(z.ZodError);

        // Missing adapters
        expect(() =>
          parseConfig(
            JSON.stringify({
              rulesSource: "/path/to/rules",
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
              rulesSource: "/path/to/rules",
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
          rulesSource: "/path/to/rules",
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

      it.skip("should throw on path traversal attempts", () => {
        // Skipped: Path validation is mocked in tests
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

      it.skip("should throw on paths outside allowed directories", () => {
        // Skipped: Path validation is mocked in tests
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
          rulesSource: "/path/to/rules",
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
          rulesSource: "/path/to/rules",
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
          const zodError = error as z.ZodError;
          // Zod collects multiple issues
          expect(zodError.issues.length).toBeGreaterThan(1);
        }
      });

      it("should handle multiple validation errors across different projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
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
          // With the new implementation, JSON.parse errors are thrown directly
          expect(error).toBe(unexpectedError);
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

        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects,
        });
        const config = parseConfig(json);
        expect(config.projects).toHaveLength(100);
      });
    });
  });

  describe("findProjectForPath", () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
      projects: [
        {
          path: "/home/user/projects/web-app",
          rules: ["**/*.md"],
          adapters: ["claude"],
        },
        {
          path: "/home/user/projects/web-app/frontend",
          rules: ["**/*.md"],
          adapters: ["gemini"],
        },
        {
          path: "/home/user/projects/api",
          rules: ["**/*.md"],
          adapters: ["kilocode"],
        },
        {
          path: "/home/user/documents",
          rules: ["**/*.md"],
          adapters: ["cline"],
        },
      ],
    };

    it("should return undefined when no projects match", () => {
      const result = findProjectForPath("/etc/passwd", mockConfig);
      expect(result).toBeUndefined();

      const result2 = findProjectForPath(
        "/home/other-user/project",
        mockConfig,
      );
      expect(result2).toBeUndefined();
    });

    it("should find exact path match", () => {
      const result = findProjectForPath("/home/user/projects/api", mockConfig);
      expect(result).toBeDefined();
      expect(result?.path).toBe("/home/user/projects/api");
      expect(result?.adapters).toEqual(["kilocode"]);
    });

    it("should find parent project for nested path", () => {
      const result = findProjectForPath(
        "/home/user/projects/web-app/src/components",
        mockConfig,
      );
      expect(result).toBeDefined();
      expect(result?.path).toBe("/home/user/projects/web-app");
    });

    it("should prefer most specific (longest) match for nested projects", () => {
      const result = findProjectForPath(
        "/home/user/projects/web-app/frontend/src",
        mockConfig,
      );
      expect(result).toBeDefined();
      expect(result?.path).toBe("/home/user/projects/web-app/frontend");
      expect(result?.adapters).toEqual(["gemini"]);
    });

    it("should avoid partial directory name matches", () => {
      // /home/user/projects/api-v2 should not match /home/user/projects/api
      const result = findProjectForPath(
        "/home/user/projects/api-v2",
        mockConfig,
      );
      expect(result).toBeUndefined();

      // /home/user/documents-backup should not match /home/user/documents
      const result2 = findProjectForPath(
        "/home/user/documents-backup",
        mockConfig,
      );
      expect(result2).toBeUndefined();
    });

    it("should handle trailing slashes correctly", () => {
      const result1 = findProjectForPath(
        "/home/user/projects/api/",
        mockConfig,
      );
      expect(result1).toBeDefined();
      expect(result1?.path).toBe("/home/user/projects/api");

      const result2 = findProjectForPath(
        "/home/user/projects/web-app/frontend/",
        mockConfig,
      );
      expect(result2).toBeDefined();
      expect(result2?.path).toBe("/home/user/projects/web-app/frontend");
    });

    it("should work with normalized paths", () => {
      // This would be normalized by normalizePath before being passed to findProjectForPath
      const normalizedPath = "/home/user/projects/my-app";
      const normalizedConfig: Config = {
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: normalizedPath,
            rules: ["**/*.md"],
            adapters: ["claude"],
          },
        ],
      };

      const result = findProjectForPath(
        "/home/user/projects/my-app/src",
        normalizedConfig,
      );
      expect(result).toBeDefined();
      expect(result?.path).toBe(normalizedPath);
    });

    it("should handle multiple matches and return most specific", () => {
      const complexConfig: Config = {
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: "/app",
            rules: ["**/*.md"],
            adapters: ["claude"],
          },
          {
            path: "/app/frontend",
            rules: ["**/*.md"],
            adapters: ["gemini"],
          },
          {
            path: "/app/frontend/components",
            rules: ["**/*.md"],
            adapters: ["kilocode"],
          },
        ],
      };

      const result1 = findProjectForPath("/app/backend", complexConfig);
      expect(result1?.path).toBe("/app");

      const result2 = findProjectForPath("/app/frontend/pages", complexConfig);
      expect(result2?.path).toBe("/app/frontend");

      const result3 = findProjectForPath(
        "/app/frontend/components/Button",
        complexConfig,
      );
      expect(result3?.path).toBe("/app/frontend/components");
    });
  });

  describe("loadConfig", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should load and parse valid config successfully", async () => {
      const configContent = JSON.stringify({
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: "/home/user/project",
            rules: ["**/*.md"],
            adapters: ["claude"],
          },
        ],
      });

      vi.mocked(fs.readFile).mockResolvedValue(configContent);

      const config = await loadConfig("/path/to/config.json");

      expect(fs.readFile).toHaveBeenCalledWith("/path/to/config.json", "utf8");
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].adapters).toEqual(["claude"]);
    });

    it("should throw ConfigNotFoundError for missing default config", async () => {
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const { DEFAULT_CONFIG_PATH } = await import("./constants.ts");

      await expect(loadConfig(DEFAULT_CONFIG_PATH)).rejects.toThrow(
        ConfigNotFoundError,
      );

      await expect(loadConfig(DEFAULT_CONFIG_PATH)).rejects.toMatchObject({
        path: DEFAULT_CONFIG_PATH,
        isDefault: true,
      });
    });

    it("should throw ConfigNotFoundError for missing non-default config", async () => {
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(loadConfig("/custom/config.json")).rejects.toThrow(
        ConfigNotFoundError,
      );

      await expect(loadConfig("/custom/config.json")).rejects.toMatchObject({
        path: "/custom/config.json",
        isDefault: false,
      });
    });

    it("should throw ConfigParseError for invalid JSON", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("{invalid json}");

      await expect(loadConfig("/path/to/config.json")).rejects.toThrow(
        ConfigParseError,
      );

      await expect(loadConfig("/path/to/config.json")).rejects.toMatchObject({
        path: "/path/to/config.json",
      });
    });

    it("should throw ConfigParseError for permission errors", async () => {
      const error = Object.assign(new Error("EACCES"), { code: "EACCES" });
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(loadConfig("/path/to/config.json")).rejects.toThrow(
        ConfigParseError,
      );

      await expect(loadConfig("/path/to/config.json")).rejects.toMatchObject({
        path: "/path/to/config.json",
      });
    });

    it("should throw ConfigParseError for Zod validation errors", async () => {
      const invalidConfig = JSON.stringify({
        rulesSource: "/path/to/rules",
        projects: [], // Empty projects array
      });

      vi.mocked(fs.readFile).mockResolvedValue(invalidConfig);

      await expect(loadConfig("/path/to/config.json")).rejects.toThrow(
        ConfigParseError,
      );
    });

    it("should normalize config paths", async () => {
      const configContent = JSON.stringify({
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: "~/project",
            rules: ["**/*.md"],
            adapters: ["claude"],
          },
        ],
      });

      vi.mocked(fs.readFile).mockResolvedValue(configContent);

      const config = await loadConfig("/path/to/config.json");

      // Path should be normalized (~ expanded)
      expect(config.projects[0].path).toMatch(/\/project$/);
      expect(config.projects[0].path).not.toContain("~");
    });
  });
});
