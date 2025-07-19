import { describe, it, expect, beforeEach } from "vitest";
import * as path from "path";
import {
  runCLI,
  runCLIWithInput,
  expectSuccess,
  containsInOutput,
} from "../helpers/cli-runner.ts";
import {
  createTestProject,
  fileExists,
  readTestFile,
  testContext,
  createManifestFile,
} from "../helpers/setup.ts";
import { createDirectoryStructure } from "../helpers/fs-utils.ts";
import { CONTENT } from "../fixtures/scenarios/index.ts";

describe("Sync Scenarios", () => {
  let projectsPath: string;

  beforeEach(async () => {
    projectsPath = testContext.tempDir;
  });

  describe.each([
    { 
      name: "Two Project Sync",
      projectCount: 2,
      scenarios: [
        {
          name: "skip identical files",
          projectFiles: [
            {
              ".cursorrules.md": CONTENT.cursor.basic,
              ".clinerules.md": CONTENT.cli.basic,
              ".clinerules-style.md": CONTENT.style.basic,
            },
            {
              ".cursorrules.md": CONTENT.cursor.basic,
              ".clinerules.md": CONTENT.cli.basic,
              ".clinerules-style.md": CONTENT.style.basic,
            }
          ],
          expectedResult: (result: any) => {
            expectSuccess(result);
            expect(containsInOutput(result, "No synchronization needed")).toBe(true);
          }
        },
        {
          name: "propagate newest version when content differs",
          projectFiles: [
            {
              ".cursorrules.md": {
                content: CONTENT.cursor.v2,
                mtime: new Date("2024-01-02"),
              },
              ".clinerules.md": CONTENT.cli.basic,
            },
            {
              ".cursorrules.md": {
                content: CONTENT.cursor.v1,
                mtime: new Date("2024-01-01"),
              },
              ".clinerules.md": CONTENT.cli.jsCallbacks,
            }
          ],
          expectedResult: async (result: any, projects: string[]) => {
            expectSuccess(result);
            expect(await readTestFile(projects[1], ".cursorrules.md")).toBe(
              CONTENT.cursor.v2, // Expected: ProjectA's v2 content (newer)
            );
          }
        },
        {
          name: "copy files to projects where they are missing",
          projectFiles: [
            {
              ".cursorrules.md": CONTENT.cursor.descriptiveNames,
              ".clinerules.md": CONTENT.cli.typeScript,
              ".kilocode/setup.md": CONTENT.kilocode.functional,
            },
            {
              ".cursorrules.md": CONTENT.cursor.descriptiveNames,
            }
          ],
          expectedResult: async (result: any, projects: string[]) => {
            expectSuccess(result);
            expect(await fileExists(projects[1], ".clinerules.md")).toBe(true);
            expect(await fileExists(projects[1], ".kilocode/setup.md")).toBe(true);
          }
        }
      ]
    },
    {
      name: "Three Project Sync",
      projectCount: 3,
      scenarios: [
        {
          name: "handle complex three-way sync",
          projectFiles: [
            {
              ".cursorrules.md": CONTENT.cursor.descriptiveNames,
              ".clinerules.md": CONTENT.cli.typeScript,
              ".kilocode/setup.md": CONTENT.kilocode.functional,
            },
            {
              ".cursorrules.md": CONTENT.cursor.descriptiveNames,
            },
            {
              ".clinerules.md": CONTENT.cli.typeScript,
            }
          ],
          expectedResult: async (result: any, projects: string[]) => {
            expectSuccess(result);
            // Verify all projects have all files
            for (const project of projects) {
              expect(await fileExists(project, ".cursorrules.md")).toBe(true);
              expect(await fileExists(project, ".clinerules.md")).toBe(true);
              expect(await fileExists(project, ".kilocode/setup.md")).toBe(true);
            }
          }
        }
      ]
    }
  ])("$name", ({ projectCount, scenarios }) => {
    it.each(scenarios)("should $name", async ({ projectFiles, expectedResult }) => {
      const projects: string[] = [];
      for (let i = 0; i < projectCount; i++) {
        const projectName = `project-${String.fromCharCode(97 + i)}`; // a, b, c...
        const projectPath = await createTestProject(projectName, projectFiles[i] || {});
        projects.push(projectPath);
        
        // Create manifest for each project listing all rule files that exist in any project
        const allRuleFiles = new Set<string>();
        projectFiles.forEach(files => {
          Object.keys(files || {}).forEach(file => allRuleFiles.add(file));
        });
        await createManifestFile(projectPath, Array.from(allRuleFiles));
      }

      const result = await runCLI(["--auto-confirm", ...projects]);

      await expectedResult(result, projects);
    });
  });

  describe("Five Project Sync", () => {
    it("should handle large-scale sync", async () => {
      const projects: string[] = [];
      const allRuleFiles = [".cursorrules.md", ".clinerules.md", ".kilocode/setup.md"];

      for (let i = 1; i <= 5; i++) {
        const projectPath = await createTestProject(`project-${i}`, {
          ".cursorrules.md": `# Cursor Rules for Project ${i}\n- Use descriptive names`,
          ...(i === 1
            ? { ".clinerules.md": "# CLI Config\n- Use TypeScript" }
            : {}),
          ...(i === 2
            ? {
                ".kilocode/setup.md":
                  "# Kilocode Setup\n- Prefer functional programming",
              }
            : {}),
        });
        
        // Create manifest for each project listing all possible rule files
        await createManifestFile(projectPath, allRuleFiles);
        projects.push(projectPath);
      }

      const result = await runCLI(["--auto-confirm", ...projects]);

      expectSuccess(result);

      for (let i = 1; i <= 5; i++) {
        expect(await fileExists(projects[i - 1], ".clinerules.md")).toBe(
          true,
        );
        expect(await fileExists(projects[i - 1], ".kilocode/setup.md")).toBe(
          true,
        );
      }
    });
  });

  describe("Interactive Mode", () => {
    it("should prompt for user decisions on differences", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.v2,
        ".clinerules.md": CONTENT.cli.basic,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
        ".clinerules.md": CONTENT.cli.jsCallbacks,
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLIWithInput(
        [pathA, pathB],
        ["1", "2"], // Use local for first file, remote for second
      );

      expectSuccess(result);
      expect(containsInOutput(result, "Reviewing")).toBe(true);
    });
    it("should allow skipping files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.v2,
        ".clinerules.md": CONTENT.cli.basic,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
        ".clinerules.md": CONTENT.cli.jsCallbacks,
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLIWithInput(
        [pathA, pathB],
        ["4", "4"], // Skip both files (option 4 in the menu)
      );

      expectSuccess(result);

      expect(containsInOutput(result, "Skip") || containsInOutput(result, "skip")).toBe(true);
    });
  });

  describe("Mixed Scenarios", () => {
    it("should handle combination of identical, different, and missing files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v2Comprehensive,
          mtime: new Date("2024-01-02"),
        },
        ".clinerules.md": CONTENT.cli.v2AsyncAwait,
        ".kilocode/rules.md": CONTENT.kilocode.functionalStyle,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v1Basic,
          mtime: new Date("2024-01-01"),
        },
        ".clinerules.md": CONTENT.cli.v2AsyncAwait, // Identical
        ".kilocode/setup.md": CONTENT.kilocode.documentation, // Missing in A
      });
      
      // Create manifests for both projects
      const allRuleFiles = [".cursorrules.md", ".clinerules.md", ".kilocode/rules.md", ".kilocode/setup.md"];
      await createManifestFile(pathA, allRuleFiles);
      await createManifestFile(pathB, allRuleFiles);

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      // Different file should be updated to newer version
      expect(await readTestFile(pathB, ".cursorrules.md")).toBe(
        CONTENT.cursor.v2Comprehensive,
      );
      // Missing files should be copied
      expect(await fileExists(pathB, ".kilocode/rules.md")).toBe(true);
      expect(await fileExists(pathA, ".kilocode/setup.md")).toBe(true);
    });
  });

  describe("Delete All Feature", () => {
    it("should preserve files in auto-confirm mode (no deletes)", async () => {
      // Tests that auto-confirm never deletes files (documented behavior)
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });
      
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
        // Missing .clinerules.md - should be copied, not deleted from A
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      
      // File should be copied to B, not deleted from A
      expect(await fileExists(pathA, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
    });
  });

  describe("Local File Exclusion", () => {
    it("should skip *.local.* files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".cursorrules.local.md": CONTENT.local.debugConsole,
        ".clinerules.local.md": CONTENT.local.apiEndpoints,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".cursorrules.local.md": CONTENT.local.apiEndpoints,
        ".clinerules.local.md": CONTENT.local.debugConsole,
      });
      
      // Create manifests - note: local files are automatically excluded by the system
      const ruleFiles = [".cursorrules.md", ".clinerules.local.md"]; // Include local file to test exclusion
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      // Local files should remain unchanged
      expect(await readTestFile(pathA, ".cursorrules.local.md")).toBe(
        CONTENT.local.debugConsole,
      );
      expect(await readTestFile(pathB, ".cursorrules.local.md")).toBe(
        CONTENT.local.apiEndpoints,
      );
      expect(await readTestFile(pathA, ".clinerules.local.md")).toBe(
        CONTENT.local.apiEndpoints,
      );
      expect(await readTestFile(pathB, ".clinerules.local.md")).toBe(
        CONTENT.local.debugConsole,
      );
    });

    it("should sync non-local files normally", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v1,
          mtime: new Date("2024-01-01"),
        },
        ".cursorrules.local.md": CONTENT.local.debugConsole,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v2,
          mtime: new Date("2024-01-02"),
        },
        ".cursorrules.local.md": CONTENT.local.apiEndpoints,
      });
      
      // Create manifests for both projects (only non-local files)
      const ruleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      // Non-local file should be updated to newer version
      expect(await readTestFile(pathA, ".cursorrules.md")).toBe(
        CONTENT.cursor.v2,
      );
      // Local files should remain unchanged
      expect(await readTestFile(pathA, ".cursorrules.local.md")).toBe(
        CONTENT.local.debugConsole,
      );
      expect(await readTestFile(pathB, ".cursorrules.local.md")).toBe(
        CONTENT.local.apiEndpoints,
      );
    });
  });

});
