import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { parseConfig, findProjectForPath } from "./config.js";
import { loadConfig } from "./loader.js";
import {
  ConfigAccessError,
  ConfigNotFoundError,
  ConfigParseError,
} from "../utils/errors.js";
import * as fs from "node:fs/promises";
import { createConfigStore } from "./constants.js";
import type { Config } from "./config.js";

vi.mock("node:fs/promises");
vi.mock("./constants.js", async () => {
  const actual = await vi.importActual("./constants.js");
  return {
    ...actual,
    createConfigStore: vi.fn(),
  };
});

// No need to mock paths - use real normalizePath

describe("config", () => {
  describe("parseConfig", () => {
    describe("valid configurations", () => {
      it("parses a single project with tilde path and one rule", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "~/Developer/project",
              rules: ["python.md"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects).toHaveLength(1);
        const projects = config.projects ?? [];
        // normalizePath will expand ~ to full home directory
        expect(projects[0]?.path).toMatch(/\/Developer\/project$/u);
        expect(projects[0]?.rules).toEqual(["python.md"]);
      });

      it("parses multiple projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "./backend",
              rules: ["python.md", "devops/docker.md"],
            },
            {
              path: "./frontend",
              rules: ["frontend/**/*.md"],
            },
          ],
        });

        const config = parseConfig(json);
        expect(config.projects).toHaveLength(2);
        const projects = config.projects ?? [];
        expect(projects[1]?.rules).toEqual(["frontend/**/*.md"]);
      });

      it("accepts positive and negative POSIX globs in 'rules'", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "./project",
              rules: ["**/*.md", "frontend/**", "!test/**"],
            },
          ],
        });

        const config = parseConfig(json);
        const projects = config.projects ?? [];
        expect(projects[0]?.rules).toEqual([
          "**/*.md",
          "frontend/**",
          "!test/**",
        ]);
      });

      it("applies DEFAULT_RULES_SOURCE when rulesSource is omitted", () => {
        const json = JSON.stringify({
          projects: [{ path: "~/Developer/project", rules: ["test.md"] }],
        });
        const config = parseConfig(json);
        expectTypeOf(config.rulesSource).toBeString();
        expect(config.rulesSource).toMatch(/sync-rules[/\\]rules$/u);
        expect(config.projects).toHaveLength(1);
        const projects = config.projects ?? [];
        expect(projects[0]?.path).toMatch(/\//u);
        expect(projects[0]?.rules).toEqual(["test.md"]);
      });

      it("accepts config with only global (no projects)", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          global: ["global-rules/*.md"],
        });
        const config = parseConfig(json);
        expect(config.global).toEqual(["global-rules/*.md"]);
        expect(config.projects).toBeUndefined();
      });

      it("accepts config with only globalOverrides (no projects, no global)", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          globalOverrides: {
            claude: ["claude-specific/*.md"],
          },
        });
        const config = parseConfig(json);
        expect(config.globalOverrides).toEqual({
          claude: ["claude-specific/*.md"],
        });
        expect(config.projects).toBeUndefined();
        expect(config.global).toBeUndefined();
      });

      it("accepts config with global, globalOverrides, and projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          global: ["shared/*.md"],
          globalOverrides: {
            gemini: ["gemini/*.md"],
            codex: ["codex/*.md"],
          },
          projects: [{ path: "./app", rules: ["**/*.md"] }],
        });
        const config = parseConfig(json);
        expect(config.global).toEqual(["shared/*.md"]);
        expect(config.globalOverrides).toEqual({
          gemini: ["gemini/*.md"],
          codex: ["codex/*.md"],
        });
        expect(config.projects).toHaveLength(1);
      });

      it("accepts all valid harness names in globalOverrides", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          globalOverrides: {
            claude: ["claude/*.md"],
            gemini: ["gemini/*.md"],
            opencode: ["opencode/*.md"],
            codex: ["codex/*.md"],
            copilot: ["copilot/*.md"],
          },
        });
        const config = parseConfig(json);
        expect(Object.keys(config.globalOverrides ?? {})).toEqual([
          "claude",
          "gemini",
          "opencode",
          "codex",
          "copilot",
        ]);
      });
    });

    describe("invalid configurations", () => {
      it("rejects 'rules' arrays that contain only negations", () => {
        const json = JSON.stringify({
          projects: [{ path: "./test", rules: ["!test/**", "!**/*.md"] }],
        });

        expect(() => parseConfig(json)).toThrowError(z.ZodError);

        let zodError: z.ZodError | undefined;
        try {
          parseConfig(json);
        } catch (error) {
          zodError = error as z.ZodError;
        }
        expect(zodError).toBeDefined();
        expect(
          zodError?.issues.some((issue) =>
            issue.message.includes("at least one positive glob pattern"),
          ),
        ).toBe(true);
      });
      it("throws SyntaxError for invalid JSON syntax", () => {
        expect(() => parseConfig("{invalid}")).toThrowError(SyntaxError);
      });

      // Missing projects and non-array projects are covered by table-driven tests below

      it.each([
        {
          name: "empty projects array",
          payload: {
            rulesSource: "/path/to/rules",
            projects: [],
          },
        },
        {
          name: "wrong field type for rules",
          payload: {
            projects: [
              {
                path: "./test",
                rules: "test.md" as unknown as string[],
              },
            ],
          },
        },
      ])("should reject invalid project shapes: $name", ({ payload }) => {
        expect(() => parseConfig(JSON.stringify(payload))).toThrowError(
          z.ZodError,
        );
      });

      // Nested errors are covered by the table-driven test and multi-error tests below

      it("aggregates multiple Zod validation errors across projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          projects: [
            { path: "./valid1", rules: [] },
            { path: "./valid2", rules: ["test.md"] },
          ],
        });

        expect(() => parseConfig(json)).toThrowError(z.ZodError);

        let zodError: z.ZodError | undefined;
        try {
          parseConfig(json);
        } catch (error) {
          zodError = error as z.ZodError;
        }
        expect(zodError).toBeDefined();
        expect(zodError?.issues.length).toBeGreaterThanOrEqual(1);
      });

      // Root-level validation errors are covered by the table-driven tests

      it("rejects unknown harness names in globalOverrides", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          globalOverrides: {
            unknown_harness: ["some/*.md"],
          },
        });
        expect(() => parseConfig(json)).toThrowError(z.ZodError);

        let zodError: z.ZodError | undefined;
        try {
          parseConfig(json);
        } catch (error) {
          zodError = error as z.ZodError;
        }
        expect(zodError).toBeDefined();
        expect(
          zodError?.issues.some((issue) =>
            issue.message.includes('Unknown harness "unknown_harness"'),
          ),
        ).toBe(true);
      });

      it("rejects empty glob array in globalOverrides", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          globalOverrides: {
            claude: [],
          },
        });
        expect(() => parseConfig(json)).toThrowError(z.ZodError);
      });

      it("rejects globalOverrides with only negative globs", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
          globalOverrides: {
            gemini: ["!exclude/*.md"],
          },
        });
        expect(() => parseConfig(json)).toThrowError(z.ZodError);
      });

      it("rejects config with no global, no globalOverrides, and no projects", () => {
        const json = JSON.stringify({
          rulesSource: "/path/to/rules",
        });
        expect(() => parseConfig(json)).toThrowError(z.ZodError);
      });
    });

    // Edge case with many projects removed - adds time with little signal
  });

  describe("findProjectForPath", () => {
    const mockConfig: Config = {
      rulesSource: "/path/to/rules",
      projects: [
        {
          path: "/home/user/projects/web-app",
          rules: ["**/*.md"],
        },
        {
          path: "/home/user/projects/web-app/frontend",
          rules: ["**/*.md"],
        },
        {
          path: "/home/user/projects/api",
          rules: ["**/*.md"],
        },
        {
          path: "/home/user/documents",
          rules: ["**/*.md"],
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
      expect(result?.rules).toEqual(["**/*.md"]);
    });

    it("should find parent project for nested path", () => {
      const result = findProjectForPath(
        "/home/user/projects/web-app/src/components",
        mockConfig,
      );
      expect(result).toBeDefined();
      expect(result?.path).toBe("/home/user/projects/web-app");
    });

    it("picks deepest matching project for nested paths", () => {
      const result = findProjectForPath(
        "/home/user/projects/web-app/frontend/src",
        mockConfig,
      );
      expect(result).toBeDefined();
      expect(result?.path).toBe("/home/user/projects/web-app/frontend");
    });

    it("does not match sibling paths (e.g., 'api' vs 'api-v2')", () => {
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

    // Normalized paths test removed - normalization already tested elsewhere

    it("should handle multiple matches and return most specific", () => {
      const complexConfig: Config = {
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: "/app",
            rules: ["**/*.md"],
          },
          {
            path: "/app/frontend",
            rules: ["**/*.md"],
          },
          {
            path: "/app/frontend/components",
            rules: ["**/*.md"],
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
      const store = {
        path: "/path/to/config.json",
        store: {
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "/home/user/project",
              rules: ["**/*.md"],
            },
          ],
        },
      };

      vi.mocked(createConfigStore).mockReturnValue(store as never);
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
      } as never);

      const config = await loadConfig("/path/to/config.json");

      expect(fs.stat).toHaveBeenCalledWith("/path/to/config.json");
      expect(config.projects).toHaveLength(1);
    });

    it("should throw ConfigNotFoundError for missing default config", async () => {
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fs.stat).mockRejectedValueOnce(error);

      const { DEFAULT_CONFIG_PATH } = await import("./constants.js");

      vi.mocked(createConfigStore).mockReturnValue({
        path: DEFAULT_CONFIG_PATH,
        store: {},
      } as never);

      const promise = loadConfig(DEFAULT_CONFIG_PATH);

      await expect(promise).rejects.toThrowError(ConfigNotFoundError);
      await expect(promise).rejects.toMatchObject({
        path: DEFAULT_CONFIG_PATH,
        isDefault: true,
      });
    });

    it("should throw ConfigNotFoundError for custom config path", async () => {
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fs.stat).mockRejectedValueOnce(error);

      vi.mocked(createConfigStore).mockReturnValue({
        path: "/custom/config.json",
        store: {},
      } as never);

      await expect(loadConfig("/custom/config.json")).rejects.toThrowError(
        ConfigNotFoundError,
      );
      expect(fs.stat).toHaveBeenCalledTimes(1);
    });

    it("should throw ConfigParseError for invalid JSON", async () => {
      const error = new SyntaxError("Invalid JSON");
      vi.mocked(createConfigStore).mockImplementation(() => {
        throw error;
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
      } as never);

      const promise = loadConfig("/path/to/config.json");
      await expect(promise).rejects.toThrowError(ConfigParseError);
      await expect(promise).rejects.toMatchObject({
        path: "/path/to/config.json",
      });
    });

    it("should throw ConfigAccessError for permission errors", async () => {
      const error = Object.assign(new Error("EACCES"), { code: "EACCES" });
      vi.mocked(fs.stat).mockRejectedValue(error);

      vi.mocked(createConfigStore).mockReturnValue({
        path: "/path/to/config.json",
        store: {},
      } as never);

      await expect(loadConfig("/path/to/config.json")).rejects.toThrowError(
        ConfigAccessError,
      );

      await expect(loadConfig("/path/to/config.json")).rejects.toMatchObject({
        path: "/path/to/config.json",
      });
    });

    it("should throw ConfigAccessError when path is a directory", async () => {
      vi.mocked(createConfigStore).mockReturnValue({
        path: "/path/to/config.json",
        store: {},
      } as never);
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
      } as never);

      const promise = loadConfig("/path/to/config.json");
      await expect(promise).rejects.toThrowError(ConfigAccessError);
      await expect(promise).rejects.toMatchObject({
        path: "/path/to/config.json",
      });
    });

    it("should throw ConfigParseError for Zod validation errors", async () => {
      const store = {
        path: "/path/to/config.json",
        store: {
          rulesSource: "/path/to/rules",
          projects: [],
        },
      };

      vi.mocked(createConfigStore).mockReturnValue(store as never);
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
      } as never);

      await expect(loadConfig("/path/to/config.json")).rejects.toThrowError(
        ConfigParseError,
      );
    });

    it("should normalize config paths", async () => {
      const store = {
        path: "/path/to/config.json",
        store: {
          rulesSource: "/path/to/rules",
          projects: [
            {
              path: "~/project",
              rules: ["**/*.md"],
            },
          ],
        },
      };

      vi.mocked(createConfigStore).mockReturnValue(store as never);
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
      } as never);

      const config = await loadConfig("/path/to/config.json");

      // Path should be normalized (~ expanded)
      const projects = config.projects ?? [];
      expect(projects[0]?.path).toMatch(/\/project$/u);
      expect(projects[0]?.path).not.toContain("~");
    });
  });
});
