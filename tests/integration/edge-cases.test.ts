import { describe, it, expect, beforeEach } from "vitest";
import * as path from "path";
import { runCLI, expectSuccess, containsInOutput } from "../helpers/cli-runner";
import { createTestProject, fileExists, testContext } from "../helpers/setup";
import {
  createBinaryFile,
  createLargeFile,
  createSymlink,
  createDirectoryStructure,
  createFile,
} from "../helpers/fs-utils";
import { CONTENT } from "../fixtures/scenarios";

describe("Edge Cases", () => {
  let projectsPath: string;

  beforeEach(async () => {
    projectsPath = testContext.tempDir;
  });

  describe("File Patterns", () => {
    it("should skip *.local.* files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".cursorrules.local": CONTENT.local.debugConsole,
        "settings.local.yml": "apiKey: secret-a",
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.v1,
        ".cursorrules.local": CONTENT.local.apiEndpoints,
        "settings.local.yml": "apiKey: secret-b",
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".cursorrules.local")).toBe(true);
      expect(await fileExists(pathB, "settings.local.yml")).toBe(true);

      const localConfig = await import("fs").then((fs) =>
        fs.readFileSync(path.join(pathB, ".cursorrules.local"), "utf8"),
      );
      expect(localConfig).toBe(CONTENT.local.apiEndpoints);
    });

    it("should exclude .DS_Store files", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".DS_Store": "binary data",
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.v1,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".DS_Store")).toBe(false);
    });

    it("should handle nested directory structures", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules": CONTENT.cursor.basic,
        ".clinerules": CONTENT.cli.basic,
        ".kilocode/style.md": CONTENT.style.basic,
        ".kilocode/rules/functional.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules": CONTENT.cursor.v1,
        ".kilocode/style.md": CONTENT.style.basic,
        ".kilocode/rules/docs.md": CONTENT.kilocode.documentation,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules")).toBe(true);
      expect(await fileExists(pathB, ".clinerules")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/style.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/rules/functional.md")).toBe(
        true,
      );
      expect(await fileExists(pathA, ".kilocode/rules/docs.md")).toBe(true);
    });

    it("should handle files with special characters", async () => {
      const pathA = await createTestProject("project-a", {
        "file with spaces.js": CONTENT.cursor.basic,
        "file-with-dashes.js": CONTENT.cli.basic,
        "file_with_underscores.js": CONTENT.style.basic,
        "file.with.dots.js": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "*.js",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "file with spaces.js")).toBe(true);
      expect(await fileExists(pathB, "file-with-dashes.js")).toBe(true);
      expect(await fileExists(pathB, "file_with_underscores.js")).toBe(true);
      expect(await fileExists(pathB, "file.with.dots.js")).toBe(true);
    });
  });

  describe("File Types", () => {
    it("should handle empty files", async () => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      await createFile(path.join(pathA, "empty.txt"), "");

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "empty.txt")).toBe(true);
      const content = await import("fs").then((fs) =>
        fs.readFileSync(path.join(pathB, "empty.txt"), "utf8"),
      );
      expect(content).toBe("");
    });

    it("should warn for large files", async () => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      const largeFilePath = path.join(pathA, "large.txt");
      await createLargeFile(largeFilePath, 101); // 101MB

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);
      expect(containsInOutput(result, "large file")).toBe(true);
    });

    it("should skip symbolic links", async () => {
      const pathA = await createTestProject("project-a", {
        "target.txt": "target content",
      });
      const pathB = await createTestProject("project-b", {});

      const targetPath = path.join(pathA, "target.txt");
      const linkPath = path.join(pathA, "link.txt");

      try {
        await createSymlink(targetPath, linkPath);
      } catch (err) {
        // Skip test if symlinks are not supported
        return;
      }

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "target.txt")).toBe(true);
      expect(await fileExists(pathB, "link.txt")).toBe(false);
    });

    it("should process binary files correctly", async () => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      const binaryPath = path.join(pathA, "image.png");
      await createBinaryFile(binaryPath, 1024);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        "*.png",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "image.png")).toBe(true);

      const originalSize = await import("fs").then(
        (fs) => fs.statSync(binaryPath).size,
      );
      const copiedSize = await import("fs").then(
        (fs) => fs.statSync(path.join(pathB, "image.png")).size,
      );

      expect(copiedSize).toBe(originalSize);
    });

    it("should handle unicode content", async () => {
      const pathA = await createTestProject("project-a", {
        "unicode.txt": "Hello 世界! 🌍 Café naïve résumé",
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "unicode.txt")).toBe(true);
      const content = await import("fs").then((fs) =>
        fs.readFileSync(path.join(pathB, "unicode.txt"), "utf8"),
      );
      expect(content).toBe("Hello 世界! 🌍 Café naïve résumé");
    });
  });

  describe("System Integration", () => {
    it("should handle deeply nested directories", async () => {
      const pathA = await createTestProject("project-a", {
        "a/b/c/d/e/f/deep.txt": "deep content",
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "a/b/c/d/e/f/deep.txt")).toBe(true);
    });

    it("should handle mixed line endings", async () => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      const contentWithCRLF = "Line 1\\r\\nLine 2\\r\\nLine 3";
      await createFile(path.join(pathA, "crlf.txt"), contentWithCRLF);

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "*.txt",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "crlf.txt")).toBe(true);
      const content = await import("fs").then((fs) =>
        fs.readFileSync(path.join(pathB, "crlf.txt"), "utf8"),
      );
      expect(content).toBe(contentWithCRLF);
    });

    it("should handle files with no extension", async () => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      await createDirectoryStructure(pathA, {
        Dockerfile: "FROM node:18",
        LICENSE: "MIT License",
        Makefile: "build:\\n\\techo 'Building...'",
      });

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "Dockerfile",
        "LICENSE",
        "Makefile",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "Dockerfile")).toBe(true);
      expect(await fileExists(pathB, "LICENSE")).toBe(true);
      expect(await fileExists(pathB, "Makefile")).toBe(true);
    });
  });
});
