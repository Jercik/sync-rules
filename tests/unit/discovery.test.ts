import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "path";
import { promises as fs } from "node:fs";
import {
  discoverProjects,
  validateProjects,
  type ProjectInfo,
} from "../../src/discovery.ts";
import { createTestProject } from "../helpers/setup.ts";
import { createFile } from "../helpers/fs-utils.ts";

vi.mock("../../src/utils/core.ts", () => ({
  log: vi.fn(),
  debug: vi.fn(),
  normalizePath: (p: string) => p.replace(/\\/g, "/"),
  validatePathSecurity: (userPath: string, baseDir: string) => {
    const path = require("node:path");
    return path.resolve(baseDir, userPath);
  },
  generateEffectiveMdPatterns: async (patterns: string[]) => {
    // Simple mock that handles the common test cases
    return patterns.flatMap(pattern => {
      if (pattern.endsWith(".md")) {
        return [pattern];
      } else if (!pattern.includes("*") && !pattern.includes("/")) {
        // Directory pattern - check both file and directory patterns
        return [`${pattern}.md`, `${pattern}/**/*.md`];
      } else {
        return [pattern];
      }
    });
  },
  filterMdFiles: (files: string[]) => files.filter(file => file.endsWith(".md")),
}));

describe("discoverProjects", () => {
  let tempDir: string;
  let baseDir: string;

  beforeEach(async () => {
    tempDir = await createTestProject("discovery-test", {});
    baseDir = path.join(tempDir, "base");
    await fs.mkdir(baseDir, { recursive: true });
  });

  it("should discover projects with .clinerules files", async () => {
    // Create test projects
    const project1 = path.join(baseDir, "project1");
    const project2 = path.join(baseDir, "project2");
    const project3 = path.join(baseDir, "project3");

    await fs.mkdir(project1, { recursive: true });
    await fs.mkdir(project2, { recursive: true });
    await fs.mkdir(project3, { recursive: true });

    // Only project1 and project3 have rule files
    await createFile(path.join(project1, ".clinerules.md"), "rule content");
    await createFile(path.join(project3, ".cursorrules.md"), "cursor rules");

    const projects = await discoverProjects(baseDir);

    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.name).sort()).toEqual([
      "project1",
      "project3",
    ]);
    expect(projects.find((p) => p.name === "project1")?.path).toBe(project1);
    expect(projects.find((p) => p.name === "project3")?.path).toBe(project3);
  });

  it("should discover projects with .kilocode directories", async () => {
    const project1 = path.join(baseDir, "project1");
    await fs.mkdir(project1, { recursive: true });

    // Create .kilocode directory with a file inside
    const kilocodeDir = path.join(project1, ".kilocode");
    await fs.mkdir(kilocodeDir, { recursive: true });
    await createFile(path.join(kilocodeDir, "rules.md"), "rules content");

    const projects = await discoverProjects(baseDir);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("project1");
    expect(projects[0].path).toBe(project1);
  });

  it("should use custom rule patterns", async () => {
    const project1 = path.join(baseDir, "project1");
    await fs.mkdir(project1, { recursive: true });
    await createFile(path.join(project1, "custom.rules.md"), "custom rules");

    const projects = await discoverProjects(baseDir, ["custom.rules.md"]);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("project1");
  });

  it("should discover projects using complex glob patterns", async () => {
    const project1 = path.join(baseDir, "project1");
    await fs.mkdir(project1, { recursive: true });
    await createFile(path.join(project1, "project.rule.md"), "custom rules");

    const project2 = path.join(baseDir, "project2");
    await fs.mkdir(project2, { recursive: true });
    await createFile(path.join(project2, "project.rules.md"), "more custom rules");

    const projects = await discoverProjects(baseDir, ["**/*.rule.md", "**/*.rules.md"]);

    expect(projects.map((p) => p.name).sort()).toEqual([
      "project1",
      "project2",
    ]);
  });

  it("should discover rules in hidden directories", async () => {
    const project1 = path.join(baseDir, ".hidden-project");
    await fs.mkdir(project1, { recursive: true });
    await createFile(path.join(project1, ".clinerules.md"), "hidden rules");

    const projects = await discoverProjects(baseDir);

    expect(projects.map((p) => p.name)).toContain(".hidden-project");
  });
  it("should exclude directories based on exclude patterns", async () => {
    const project1 = path.join(baseDir, "project1");
    const nodeModules = path.join(baseDir, "node_modules");

    await fs.mkdir(project1, { recursive: true });
    await fs.mkdir(nodeModules, { recursive: true });

    await createFile(path.join(project1, ".clinerules.md"), "rules");
    await createFile(path.join(nodeModules, ".clinerules.md"), "rules");

    const projects = await discoverProjects(baseDir);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("project1");
  });

  it("should respect glob-based exclude patterns", async () => {
    const project1 = path.join(baseDir, "project1");
    const tempProject = path.join(baseDir, "temp-project");
    const buildProject = path.join(baseDir, "build-output");
    const normalProject = path.join(baseDir, "normal");

    await fs.mkdir(project1, { recursive: true });
    await fs.mkdir(tempProject, { recursive: true });
    await fs.mkdir(buildProject, { recursive: true });
    await fs.mkdir(normalProject, { recursive: true });

    await createFile(path.join(project1, ".clinerules.md"), "rules");
    await createFile(path.join(tempProject, ".clinerules.md"), "rules");
    await createFile(path.join(buildProject, ".clinerules.md"), "rules");
    await createFile(path.join(normalProject, ".clinerules.md"), "rules");

    // Exclude directories matching patterns
    const projects = await discoverProjects(
      baseDir,
      [".clinerules.md"],
      ["temp*", "build-*"],
    );

    expect(projects.map((p) => p.name).sort()).toEqual(["normal", "project1"]);
  });

  it("should handle complex glob patterns for exclusion", async () => {
    const devProject = path.join(baseDir, "project-dev");
    const testProject = path.join(baseDir, "project-test");
    const prodProject = path.join(baseDir, "project-prod");
    const otherProject = path.join(baseDir, "other");

    await fs.mkdir(devProject, { recursive: true });
    await fs.mkdir(testProject, { recursive: true });
    await fs.mkdir(prodProject, { recursive: true });
    await fs.mkdir(otherProject, { recursive: true });

    await createFile(path.join(devProject, ".clinerules.md"), "rules");
    await createFile(path.join(testProject, ".clinerules.md"), "rules");
    await createFile(path.join(prodProject, ".clinerules.md"), "rules");
    await createFile(path.join(otherProject, ".clinerules.md"), "rules");

    // Exclude projects matching pattern
    const projects = await discoverProjects(
      baseDir,
      [".clinerules.md"],
      ["project-*"],
    );

    expect(projects.map((p) => p.name)).toEqual(["other"]);
  });

  it("should handle **/pattern style exclusions", async () => {
    const tempDir1 = path.join(baseDir, "temp");
    const tempDir2 = path.join(baseDir, "temporary");
    const project1 = path.join(baseDir, "project1");

    await fs.mkdir(tempDir1, { recursive: true });
    await fs.mkdir(tempDir2, { recursive: true });
    await fs.mkdir(project1, { recursive: true });

    await createFile(path.join(tempDir1, ".clinerules.md"), "rules");
    await createFile(path.join(tempDir2, ".clinerules.md"), "rules");
    await createFile(path.join(project1, ".clinerules.md"), "rules");

    // Use **/temp pattern to exclude any directory starting with "temp"
    const projects = await discoverProjects(
      baseDir,
      [".clinerules.md"],
      ["**/temp*"],
    );

    expect(projects.map((p) => p.name)).toEqual(["project1"]);
  });

  it("should handle non-existent base directory", async () => {
    const nonExistentDir = path.join(tempDir, "non-existent");

    await expect(discoverProjects(nonExistentDir)).rejects.toThrow(
      "Base directory does not exist",
    );
  });

  it("should handle base directory that is not a directory", async () => {
    const filePath = path.join(tempDir, "not-a-directory");
    await createFile(filePath, "file content");

    await expect(discoverProjects(filePath)).rejects.toThrow(
      "Base directory is not a directory",
    );
  });

  it("should handle empty base directory", async () => {
    const emptyDir = path.join(tempDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });

    const projects = await discoverProjects(emptyDir);

    expect(projects).toHaveLength(0);
  });

  it("should handle projects with multiple rule types", async () => {
    const project1 = path.join(baseDir, "project1");
    await fs.mkdir(project1, { recursive: true });

    await createFile(path.join(project1, ".clinerules.md"), "cline rules");
    await createFile(path.join(project1, ".cursorrules.md"), "cursor rules");

    const kilocodeDir = path.join(project1, ".kilocode");
    await fs.mkdir(kilocodeDir, { recursive: true });
    await createFile(path.join(kilocodeDir, "rules.md"), "kilo rules");

    const projects = await discoverProjects(baseDir);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("project1");
  });
});

describe("validateProjects", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTestProject("validate-test", {});
  });

  it("should validate existing directories", async () => {
    const project1 = path.join(tempDir, "project1");
    const project2 = path.join(tempDir, "project2");

    await fs.mkdir(project1, { recursive: true });
    await fs.mkdir(project2, { recursive: true });

    await expect(
      validateProjects([project1, project2]),
    ).resolves.toBeUndefined();
  });

  it("should throw error for non-existent directory", async () => {
    const nonExistentDir = path.join(tempDir, "non-existent");

    await expect(validateProjects([nonExistentDir])).rejects.toThrow(
      "Project directory does not exist",
    );
  });

  it("should throw error for path that is not a directory", async () => {
    const filePath = path.join(tempDir, "not-a-directory");
    await createFile(filePath, "file content");

    await expect(validateProjects([filePath])).rejects.toThrow(
      "Project path is not a directory",
    );
  });

  it("should validate empty array", async () => {
    await expect(validateProjects([])).resolves.toBeUndefined();
  });

  it("should validate single project", async () => {
    const project1 = path.join(tempDir, "project1");
    await fs.mkdir(project1, { recursive: true });

    await expect(validateProjects([project1])).resolves.toBeUndefined();
  });
});
