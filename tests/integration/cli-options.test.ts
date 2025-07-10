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
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.v1,
      });

      const result = await runCLI([pathA, pathB, "--dry-run"]);

      expectSuccess(result);
      expect(containsInOutput(result, "DRY RUN")).toBe(true);
      expect(containsInOutput(result, "Would add")).toBe(true);
      expect(containsInOutput(result, "Would update")).toBe(true);

      expect(await fileExists(pathB, ".clinerules")).toBe(false);
      expect(await readTestFile(pathB, ".cursorrules")).toBe(CONTENT.cursor.v1);
    });

    it("should work with --auto-confirm", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.v1,
      });

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
        ".cursorrules": {
          content: CONTENT.cursor.basic,
          mtime: new Date("2024-01-02"),
        },
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": {
          content: CONTENT.cursor.v1,
          mtime: new Date("2024-01-01"),
        },
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);
      expect(containsInOutput(result, "automatically")).toBe(true);
      expect(await readTestFile(pathB, ".cursorrules")).toBe(
        CONTENT.cursor.basic,
      );
    });

    it("should copy missing files without prompting", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.basic,
      });

      const result = await runCLI([pathA, pathB, "--auto-confirm"]);

      expectSuccess(result);
      expect(await fileExists(pathB, ".clinerules")).toBe(true);
    });
  });

  describe("--exclude", () => {
    it("should apply custom exclusion patterns", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
        ".kilocode/example.test.md": CONTENT.kilocode.documentation,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--exclude",
        "*.test.md",
        "*.spec.md",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".clinerules")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/example.test.md")).toBe(false);
    });

    it("should combine with default exclusions", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".cursorrules.local": CONTENT.local.debugConsole,
        ".temp-rules": CONTENT.cursor.v1,
        ".DS_Store": "system file",
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        "--exclude",
        "temp.*",
        "--auto-confirm",
        pathA,
        pathB,
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".cursorrules.local")).toBe(false);
      expect(await fileExists(pathB, ".temp-rules")).toBe(false);
      expect(await fileExists(pathB, ".DS_Store")).toBe(false);
    });
  });

  describe("--rules", () => {
    it("should handle non-existent rules file", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        pathA,
        pathB,
        "--rules",
        "nonexistent.sync-rules",
      ]);

      expectSuccess(result);
      expect(containsInOutput(result, "No rule files found")).toBe(true);
    });
  });

  describe("Custom patterns via arguments", () => {
    it("should accept patterns as arguments", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        ".cursorrules",
        ".clinerules",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".clinerules")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(false);
    });
  });

  describe("--help", () => {
    it("should display help information", async () => {
      const result = await runCLI(["--help"]);

      expectSuccess(result);
      expect(containsInOutput(result, "Usage")).toBe(true);
      expect(containsInOutput(result, "--dry-run")).toBe(true);
      expect(containsInOutput(result, "--auto-confirm")).toBe(true);
      expect(containsInOutput(result, "--exclude")).toBe(true);
      expect(containsInOutput(result, "--rules")).toBe(true);
    });
  });

  describe("--version", () => {
    it("should display version information", async () => {
      const result = await runCLI(["--version"]);

      expectSuccess(result);
      // Remove sync-rules check as version output is just the version number
      expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("Option combinations", () => {
    it("should handle --dry-run with --exclude", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
        ".kilocode/example.test.md": CONTENT.kilocode.documentation,
      });

      const pathB = await createTestProject("project-b", {});

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

    it("should handle --rules with --exclude", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".kilocode/setup.md": CONTENT.kilocode.functional,
        ".kilocode/temp.config": CONTENT.kilocode.documentation,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        ".cursorrules",
        ".kilocode",
        "--exclude",
        "temp.*",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/temp.config")).toBe(false);
    });
  });

  describe("Invalid options", () => {
    it("should handle unknown options", async () => {
      const result = await runCLI(["--unknown-option"]);

      expectFailure(result);
      expect(containsInOutput(result, "Unknown")).toBe(true);
    });

    it("should handle missing required arguments", async () => {
      const result = await runCLI(["--rules"]);

      expectFailure(result);
      expect(containsInOutput(result, "argument missing")).toBe(true);
    });
  });
});
