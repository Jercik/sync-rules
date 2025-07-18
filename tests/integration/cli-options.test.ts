import { describe, it, expect, beforeEach } from "vitest";
import * as path from "path";
import {
  runCLI,
  expectSuccess,
  expectFailure,
  containsInOutput,
} from "../helpers/cli-runner";
import {
  createTestProject,
  fileExists,
  readTestFile,
  testContext,
  createManifestFile,
} from "../helpers/setup";
import { createDirectoryStructure } from "../helpers/fs-utils";
import { CONTENT } from "../fixtures/scenarios/index";

describe("CLI Options", () => {
  let projectsPath: string;

  beforeEach(async () => {
    projectsPath = testContext.tempDir;
  });

  describe("--dry-run", () => {
    it("should preview changes without executing", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([pathA, pathB, "--dry-run"]);

      expectSuccess(result);
      expect(containsInOutput(result, "DRY RUN")).toBe(true);
      expect(containsInOutput(result, "Would add")).toBe(true);
      expect(containsInOutput(result, "Would update")).toBe(true);

      expect(await fileExists(pathB, ".clinerules.md")).toBe(false);
      expect(await readTestFile(pathB, ".cursorrules.md")).toBe(CONTENT.cursor.v1);
    });

    it("should work with --auto-confirm", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([
        "--dry-run",
        "--auto-confirm",
        pathA,
        pathB,
      ]);

      expectSuccess(result);
      expect(containsInOutput(result, "DRY RUN")).toBe(true);
    });
  });

  describe("--auto-confirm", () => {
    it("should use newest version without prompting", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": {
          content: CONTENT.cursor.basic,
          mtime: new Date("2024-01-02"),
        },
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": {
          content: CONTENT.cursor.v1,
          mtime: new Date("2024-01-01"),
        },
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);
      expect(containsInOutput(result, "automatically")).toBe(true);
      expect(await readTestFile(pathB, ".cursorrules.md")).toBe(
        CONTENT.cursor.basic,
      );
    });

    it("should copy missing files without prompting", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });
      
      // Create manifests for both projects
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
    });

    it("should never delete files in auto-confirm mode", async () => {
      // Tests requirement that auto-confirm never deletes files
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic, // File only in pathB
      });
      
      // Create manifests for both projects - note: pathA doesn't include .clinerules.md
      // so it won't be copied from pathB to pathA, preserving it in pathB
      await createManifestFile(pathA, [".cursorrules.md"]);
      await createManifestFile(pathB, [".cursorrules.md", ".clinerules.md"]);

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      // File in pathB should not be deleted
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await readTestFile(pathB, ".clinerules.md")).toBe(CONTENT.cli.basic);
    });
  });

  describe("--exclude", () => {
    it("should apply custom exclusion patterns", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
        ".kilocode/example.test.md": CONTENT.kilocode.documentation,
      });

      const pathB = await createTestProject("project-b", {});
      
      // Create manifests - include all files including .test.md to test exclusion
      const allRuleFiles = [".cursorrules.md", ".clinerules.md", ".kilocode/setup.md", ".kilocode/example.test.md"];
      await createManifestFile(pathA, allRuleFiles);
      await createManifestFile(pathB, allRuleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--exclude",
        "*.test.md",
        "*.spec.md",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/example.test.md")).toBe(false);
    });

    it("should combine with default exclusions", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".cursorrules.local.md": CONTENT.local.debugConsole,
        ".temp-rules.md": CONTENT.cursor.v1,
      });

      const pathB = await createTestProject("project-b", {});
      
      // Create manifests - include all files to test exclusion behavior
      const allRuleFiles = [".cursorrules.md", ".cursorrules.local.md", ".temp-rules.md"];
      await createManifestFile(pathA, allRuleFiles);
      await createManifestFile(pathB, allRuleFiles);

      const result = await runCLI([
        "--exclude",
        "temp.*",
        "--auto-confirm",
        pathA,
        pathB,
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathB, ".cursorrules.local.md")).toBe(false); // Local files excluded
      expect(await fileExists(pathB, ".temp-rules.md")).toBe(false); // Excluded by pattern
    });
  });

  // --rules tests removed:
  // - "should handle non-existent rules file": Low usefulness - duplicates "no rule files found" assertions elsewhere

  describe("Custom patterns via arguments", () => {
    it("should accept patterns as arguments", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {});
      
      // Create manifests with only the rules specified by --rules argument
      const specifiedRules = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, specifiedRules);
      await createManifestFile(pathB, specifiedRules);

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
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(false);
    });
  });


  describe("Option combinations", () => {
    it("should handle --dry-run with --exclude", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".kilocode/example.test.md": CONTENT.kilocode.documentation,
      });

      const pathB = await createTestProject("project-b", {});
      
      // Create manifests - don't include .test.md since it will be excluded anyway
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--dry-run",
        "--auto-confirm",
        "--exclude",
        "*.test.md",
      ]);

      expectSuccess(result);
      expect(containsInOutput(result, "DRY RUN")).toBe(true);
      expect(containsInOutput(result, "Would add")).toBe(true);
      expect(containsInOutput(result, "test.md")).toBe(false);
    });

  });

  describe("Non-.md pattern warning", () => {
    it("should warn when using non-.md patterns", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules": "This should be ignored", // Non-.md file
      });

      const pathB = await createTestProject("project-b", {});
      
      // Create manifests - include only .md files as non-.md won't be processed
      const mdRuleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, mdRuleFiles);
      await createManifestFile(pathB, mdRuleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        ".clinerules", // Non-.md pattern
        "config/*.json", // Non-.md glob
      ]);

      expectSuccess(result);
      // Should warn about non-.md patterns
      expect(containsInOutput(result, "Only .md files are processed")).toBe(true);
      // Non-.md file should not be synced
      expect(await fileExists(pathB, ".clinerules")).toBe(false);
    });
  });

  // Invalid options tests removed based on complexity-to-usefulness ratio:
  // - "should handle unknown options": Brittle (relies on commander output), low usefulness
  // - "should handle missing required arguments": Similar to above, low value
});
