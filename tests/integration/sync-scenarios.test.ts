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
} from "../helpers/setup.ts";
import { createDirectoryStructure } from "../helpers/fs-utils.ts";
import { CONTENT } from "../fixtures/scenarios/index.ts";

describe("Sync Scenarios", () => {
  let projectsPath: string;

  beforeEach(async () => {
    projectsPath = testContext.tempDir;
  });

  describe("Two Project Sync", () => {
    it("should skip identical files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".clinerules-style.md": CONTENT.style.basic,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".clinerules-style.md": CONTENT.style.basic,
      });

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(containsInOutput(result, "No synchronization needed")).toBe(true);
    });

    it("should propagate newest version when content differs", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v2,
          mtime: new Date("2024-01-02"),
        },
        ".clinerules.md": CONTENT.cli.basic,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v1,
          mtime: new Date("2024-01-01"),
        },
        ".clinerules.md": CONTENT.cli.jsCallbacks,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);
      expect(await readTestFile(pathB, ".cursorrules.md")).toBe(
        CONTENT.cursor.v2, // Expected: ProjectA's v2 content (newer)
      );
    });

    it("should copy files to projects where they are missing", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.descriptiveNames,
        ".clinerules.md": CONTENT.cli.typeScript,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.descriptiveNames,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(true);
    });
  });

  describe("Three Project Sync", () => {
    it("should handle complex three-way sync", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.descriptiveNames,
        ".clinerules.md": CONTENT.cli.typeScript,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
      });
      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.descriptiveNames,
      });
      const pathC = await createTestProject("project-c", {
        ".clinerules.md": CONTENT.cli.typeScript,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB, pathC]);

      expectSuccess(result);

      expect(await fileExists(pathA, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathC, ".cursorrules.md")).toBe(true);

      expect(await fileExists(pathA, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathC, ".clinerules.md")).toBe(true);
    });
  });

  describe("Five Project Sync", () => {
    it("should handle large-scale sync", async () => {
      const projects: string[] = [];

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

  describe("Custom Rules", () => {
    it("should use custom rule patterns", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v2,
      });

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        ".cursorrules.md",
        ".clinerules.md",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(false); // Should be excluded since .kilocode is not in the custom rules
    });
  });
});
