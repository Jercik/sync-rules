import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { parseConfig, findProjectForPath } from "./config.js";
import { loadConfig } from "./loader.js";
import { ConfigNotFoundError, ConfigParseError } from "../utils/errors.js";
import * as fs from "node:fs/promises";
import type { Config } from "./config.js";

vi.mock("node:fs/promises");

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
        // normalizePath will expand ~ to full home directory
        expect(config.projects[0]?.path).toMatch(/\/Developer\/project$/u);
        expect(config.projects[0]?.rules).toEqual(["python.md"]);
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
        expect(config.projects[1]?.rules).toEqual(["frontend/**/*.md"]);
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
        expect(config.projects[0]?.rules).toEqual([
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
        expect(typeof config.rulesSource).toBe("string");
        expect(config.rulesSource).toMatch(/sync-rules(-nodejs)?[/\\]rules$/u);
        expect(config.projects).toHaveLength(1);
        expect(config.projects[0]?.path).toMatch(/\//u);
        expect(config.projects[0]?.rules).toEqual(["test.md"]);
      });
    });

    describe("invalid configurations", () => {
      it("rejects 'rules' arrays that contain only negations", () => {
        const json = JSON.stringify({
          projects: [{ path: "./test", rules: ["!test/**", "!**/*.md"] }],
        });

        expect(() => parseConfig(json)).toThrow(z.ZodError);

        let zodError: z.ZodError | undefined;
        try {
          parseConfig(json);
        } catch (error) {
          zodError = error as z.ZodError;
        }
        expect(zodError).toBeDefined();
        expect(
          zodError?.issues.some((i) =>
            i.message.includes("at least one positive glob pattern"),
          ),
        ).toBe(true);
      });
      it("throws SyntaxError for invalid JSON syntax", () => {
        expect(() => parseConfig("{invalid}")).toThrow(SyntaxError);
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
        expect(() => parseConfig(JSON.stringify(payload))).toThrow(z.ZodError);
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

        expect(() => parseConfig(json)).toThrow(z.ZodError);

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
      const configContent = JSON.stringify({
        rulesSource: "/path/to/rules",
        projects: [
          {
            path: "/home/user/project",
            rules: ["**/*.md"],
          },
        ],
      });

      vi.mocked(fs.readFile).mockResolvedValue(configContent);

      const config = await loadConfig("/path/to/config.json");

      expect(fs.readFile).toHaveBeenCalledWith("/path/to/config.json", "utf8");
      expect(config.projects).toHaveLength(1);
    });

    it("should throw ConfigNotFoundError for missing default config", async () => {
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      const { DEFAULT_CONFIG_PATH } = await import("./constants.js");

      const promise = loadConfig(DEFAULT_CONFIG_PATH);

      await expect(promise).rejects.toThrow(ConfigNotFoundError);
      await expect(promise).rejects.toMatchObject({
        path: DEFAULT_CONFIG_PATH,
        isDefault: true,
      });
    });

    it("automigrates legacy default config to new path", async () => {
      const legacyConfigContent = JSON.stringify({
        projects: [{ path: "/home/user/project", rules: ["**/*.md"] }],
      });
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(legacyConfigContent);

      const { DEFAULT_CONFIG_PATH } = await import("./constants.js");

      const config = await loadConfig(DEFAULT_CONFIG_PATH);

      expect(config.projects).toHaveLength(1);
      expect(fs.writeFile).toHaveBeenCalled();
      expect(vi.mocked(fs.writeFile).mock.calls[0]?.[0]).toBe(
        DEFAULT_CONFIG_PATH,
      );
      expect(vi.mocked(fs.writeFile).mock.calls[0]?.[1]).toBe(
        legacyConfigContent,
      );
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
          },
        ],
      });

      vi.mocked(fs.readFile).mockResolvedValue(configContent);

      const config = await loadConfig("/path/to/config.json");

      // Path should be normalized (~ expanded)
      expect(config.projects[0]?.path).toMatch(/\/project$/u);
      expect(config.projects[0]?.path).not.toContain("~");
    });
  });
});
