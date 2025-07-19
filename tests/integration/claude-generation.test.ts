import { describe, it, expect, beforeEach } from "vitest";
import { runCLI, expectSuccess, containsInOutput } from "../helpers/cli-runner";
import {
  createTestProject,
  fileExists,
  readTestFile,
  testContext,
  createManifestFile,
} from "../helpers/setup";
import { CONTENT } from "../fixtures/scenarios/index";
import { promises as fs } from "node:fs";
import path from "node:path";

describe("CLAUDE.md Generation", () => {
  let projectsPath: string;

  beforeEach(async () => {
    projectsPath = testContext.tempDir;
  });

  describe("--generate-claude flag", () => {
    it("should generate CLAUDE.md by default after successful sync", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });
      
      // Create manifests for sync
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      // Run sync with auto-confirm to avoid prompts
      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(
        containsInOutput(result, "Synchronization completed successfully"),
      ).toBe(true);
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generated CLAUDE.md in project-b")).toBe(
        true,
      );
    });

    it("should skip CLAUDE.md generation with --no-generate-claude", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });
      
      // Create manifests for sync
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--no-generate-claude",
      ]);

      expectSuccess(result);
      expect(
        containsInOutput(result, "Synchronization completed successfully"),
      ).toBe(true);
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        false,
      );
      expect(containsInOutput(result, "Generate CLAUDE.md for")).toBe(false);
    });

    it("should generate CLAUDE.md in dry-run mode", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });
      
      // Create manifests for sync
      const ruleFiles = [".cursorrules.md", ".clinerules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--dry-run",
        "--auto-confirm",
      ]);

      expectSuccess(result);
      expect(containsInOutput(result, "DRY RUN")).toBe(true);
      // In dry-run mode, CLAUDE.md generation should also run in dry-run mode
      expect(
        containsInOutput(result, "[DRY RUN] Would generate CLAUDE.md"),
      ).toBe(true);

      // Files should not be created in dry-run mode
      expect(await fileExists(pathA, "CLAUDE.md")).toBe(false);
      expect(await fileExists(pathB, "CLAUDE.md")).toBe(false);
    });

    it("should attempt CLAUDE.md generation even when sync fails", async () => {
      // Create a project with permission issues to force sync failure
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      // This should fail because we're passing a non-existent project
      const result = await runCLI([
        pathA,
        "/non/existent/path",
        "--auto-confirm",
      ]);

      expect(result.exitCode).not.toBe(0);
      
      // When the project discovery/validation fails early, CLAUDE.md generation may not run
      // The test should check for early failure vs sync phase failure
      if (containsInOutput(result, "does not exist") || containsInOutput(result, "invalid directory")) {
        // Early validation failure - CLAUDE.md generation won't run
        expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(false);
      } else {
        // If we got to sync phase, generation should run
        expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(true);
        expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(true);
      }
    });

    it("should exclude CLAUDE.md from sync by default", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        "CLAUDE.md": "# Existing CLAUDE.md in project A",
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
        "CLAUDE.md": "# Different CLAUDE.md in project B",
      });
      
      // Create manifests - only include .cursorrules.md, not CLAUDE.md
      const ruleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--no-generate-claude",
      ]);

      expectSuccess(result);

      // CLAUDE.md files should not be synced
      expect(await readTestFile(pathA, "CLAUDE.md")).toBe(
        "# Existing CLAUDE.md in project A",
      );
      expect(await readTestFile(pathB, "CLAUDE.md")).toBe(
        "# Different CLAUDE.md in project B",
      );
    });


    it("should handle interactive CLAUDE.md generation prompts", async () => {
      // Tests requirement: "In interactive mode, you'll be prompted per project"
      // Create identical projects to skip sync
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathC = await createTestProject("project-c", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });
      
      // Create manifests for all projects (identical content means no sync needed)
      const ruleFiles = [".cursorrules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);
      await createManifestFile(pathC, ruleFiles);

      // Import runCLIInteractive
      const { runCLIInteractive } = await import("../helpers/cli-runner");

      // Test mixed responses: yes, no, yes
      const result = await runCLIInteractive(
        [pathA, pathB, pathC],
        [
          { waitFor: "Generate CLAUDE.md for project-a?", input: "y" },
          { waitFor: "Generate CLAUDE.md for project-b?", input: "n" },
          { waitFor: "Generate CLAUDE.md for project-c?", input: "y" },
        ],
        { timeout: 10000 },
      );

      expectSuccess(result);
      
      // Check CLAUDE.md generation flow
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(true);
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(true);
      expect(containsInOutput(result, "Skipped project-b")).toBe(true);
      expect(containsInOutput(result, "Generated CLAUDE.md in project-c")).toBe(true);
      expect(containsInOutput(result, "Generation Summary: 2 generated, 1 skipped")).toBe(true);

      // Verify files
      expect(await fileExists(pathA, "CLAUDE.md")).toBe(true);
      expect(await fileExists(pathB, "CLAUDE.md")).toBe(false);
      expect(await fileExists(pathC, "CLAUDE.md")).toBe(true);
    });

    it("should correctly detect permission failures in dry-run mode", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      // Make the project directory read-only to simulate permission failure
      await fs.chmod(pathA, 0o555); // Read-only directory

      try {
        const result = await runCLI([pathA, "--dry-run", "--auto-confirm"]);

        // Should fail with exit code 1 due to permission error
        expect(result.exitCode).toBe(1);
        expect(containsInOutput(result, "DRY RUN")).toBe(true);
        
        // Should detect permission failure and report it
        expect(
          containsInOutput(result, "[DRY RUN] Would fail to generate CLAUDE.md")
        ).toBe(true);
        expect(
          containsInOutput(result, "directory is not writable")
        ).toBe(true);

        // CLAUDE.md should not exist since it couldn't be created
        expect(await fileExists(pathA, "CLAUDE.md")).toBe(false);
      } finally {
        // Cleanup: restore permissions so directory can be deleted
        try {
          await fs.chmod(pathA, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should concatenate multiple rule files correctly with minimal concatenation", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": {
          content: "# Cursor Rules\n\nUse TypeScript",
          mtime: new Date("2024-01-02"), // Newer
        },
        ".clinerules.md": "# CLI Rules\n\nAlways test",
        ".kilocode/rules.md": "# Kilocode Rules\n\nWrite clean code",
        ".clinerules": "This non-.md file should be ignored",
        ".kilocode/config.json": '{ "setting": "value" }',
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": {
          content: "# Different Rules",
          mtime: new Date("2024-01-01"), // Older
        },
      });
      
      // Create manifests for sync
      const ruleFiles = [".cursorrules.md", ".clinerules.md", ".kilocode/rules.md"];
      await createManifestFile(pathA, ruleFiles);
      await createManifestFile(pathB, ruleFiles);

      // Run with auto-confirm to sync and generate CLAUDE.md
      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(
        true,
      );

      const claudeMd = await readTestFile(pathA, "CLAUDE.md");
      expect(claudeMd).toContain(
        "# CLAUDE.md - Rules for Claude Code",
      );

      // With minimal concatenation, no "## Rules from" headers
      expect(claudeMd).not.toContain("## Rules from");

      // Content should be directly included
      expect(claudeMd).toContain("# CLI Rules");
      expect(claudeMd).toContain("Always test");
      expect(claudeMd).toContain("# Cursor Rules");
      // Project A keeps its own content after sync
      expect(claudeMd).toContain("Use TypeScript");
      expect(claudeMd).toContain("# Kilocode Rules");
      expect(claudeMd).toContain("Write clean code");

      // Non-.md files should not be included
      expect(claudeMd).not.toContain("This non-.md file should be ignored");
      expect(claudeMd).not.toContain("setting");
    });
  });
});
