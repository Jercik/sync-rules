import { describe, it, expect, beforeEach } from "vitest";
import { runCLI, expectSuccess, containsInOutput } from "../helpers/cli-runner";
import {
  createTestProject,
  fileExists,
  readTestFile,
  testContext,
} from "../helpers/setup";
import { CONTENT } from "../fixtures/scenarios/index";

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

    it("should not generate CLAUDE.md when sync fails", async () => {
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
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        false,
      );
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

    it("should handle projects without rule files", async () => {
      const pathA = await createTestProject("project-a", {
        "README.md": "# Project A",
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        true,
      );

      // With auto-confirm, both projects should get CLAUDE.md generated
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generated CLAUDE.md in project-b")).toBe(
        true,
      );
    });

    // TODO: These tests are skipped because interactive CLAUDE.md generation prompts
    // only work without --auto-confirm, but that requires handling sync prompts first.
    // Consider adding a --interactive-claude flag or improving test infrastructure.
    it("should handle user declining CLAUDE.md generation", async () => {
      // Create identical projects to skip sync
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      // Import runCLIInteractive
      const { runCLIInteractive } = await import("../helpers/cli-runner");

      // Run with identical files so no sync needed, but still get CLAUDE.md prompts
      const result = await runCLIInteractive(
        [pathA, pathB],
        [
          { waitFor: "Generate CLAUDE.md for project-a?", input: "n" },
          { waitFor: "Generate CLAUDE.md for project-b?", input: "n" },
        ],
        { timeout: 10000 },
      );

      expectSuccess(result);
      // With identical files, should skip sync but still generate
      expect(containsInOutput(result, "No synchronization needed")).toBe(
        true,
      );
      // Check CLAUDE.md generation flow
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generate CLAUDE.md for project-a?")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generate CLAUDE.md for project-b?")).toBe(
        true,
      );
      expect(containsInOutput(result, "Skipped project-a")).toBe(true);
      expect(containsInOutput(result, "Skipped project-b")).toBe(true);
      expect(containsInOutput(result, "Generation Summary: 0 generated, 2 skipped")).toBe(
        true,
      );
    });

    // See TODO comment above - same issue with interactive CLAUDE.md prompts
    it("should prompt per project in interactive mode", async () => {
      // Tests requirement: "In interactive mode, you'll be prompted per project"
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.basic,
      });

      // Import runCLIInteractive
      const { runCLIInteractive } = await import("../helpers/cli-runner");

      // Run with identical files so no sync prompts, just CLAUDE.md prompts
      const result = await runCLIInteractive(
        [pathA, pathB],
        [
          { waitFor: "Generate CLAUDE.md for project-a?", input: "y" },
          { waitFor: "Generate CLAUDE.md for project-b?", input: "n" },
        ],
        { timeout: 10000 },
      );

      expectSuccess(result);
      // Check CLAUDE.md generation flow with per-project prompts
      expect(containsInOutput(result, "Starting CLAUDE.md generation")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generate CLAUDE.md for project-a?")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generate CLAUDE.md for project-b?")).toBe(
        true,
      );
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(
        true,
      );
      expect(containsInOutput(result, "Skipped project-b")).toBe(true);
      expect(containsInOutput(result, "Generation Summary: 1 generated, 1 skipped")).toBe(
        true,
      );

      // Verify files
      expect(await fileExists(pathA, "CLAUDE.md")).toBe(true);
      expect(await fileExists(pathB, "CLAUDE.md")).toBe(false);
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

      // Run with auto-confirm to sync and generate CLAUDE.md
      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(containsInOutput(result, "Generated CLAUDE.md in project-a")).toBe(
        true,
      );

      const claudeMd = await readTestFile(pathA, "CLAUDE.md");
      expect(claudeMd).toContain(
        "# CLAUDE.md - Generated Rules for Claude Code",
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
