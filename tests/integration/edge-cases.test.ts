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
      // Tests requirement that local files are not synced
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".cursorrules.local.md": CONTENT.local.debugConsole,
        "settings.local.md": "apiKey: secret-a", // Changed to .md
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
        ".cursorrules.local.md": CONTENT.local.apiEndpoints,
        "settings.local.md": "apiKey: secret-b", // Changed to .md
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      // Regular files should sync
      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      // Local files should remain unchanged
      expect(await fileExists(pathB, ".cursorrules.local.md")).toBe(true);
      expect(await fileExists(pathB, "settings.local.md")).toBe(true);

      const localConfig = await import("fs").then((fs) =>
        fs.readFileSync(path.join(pathB, ".cursorrules.local.md"), "utf8"),
      );
      expect(localConfig).toBe(CONTENT.local.apiEndpoints); // Unchanged
    });

    it("should ignore non-.md files due to .md constraint", async () => {
      // Tests global .md constraint - non-.md files are ignored
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".DS_Store": "binary data", // Non-.md system file
        "config.json": '{"key": "value"}', // Non-.md config
        "README.txt": "documentation", // Non-.md text
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      // Only .md files should be synced
      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      // Non-.md files should be ignored
      expect(await fileExists(pathB, ".DS_Store")).toBe(false);
      expect(await fileExists(pathB, "config.json")).toBe(false);
      expect(await fileExists(pathB, "README.txt")).toBe(false);
    });

    it("should handle nested directory structures", async () => {
      const pathA = await createTestProject("project-a", {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
        ".kilocode/style.md": CONTENT.style.basic,
        ".kilocode/rules/functional.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {
        ".cursorrules.md": CONTENT.cursor.v1,
        ".kilocode/style.md": CONTENT.style.basic,
        ".kilocode/rules/docs.md": CONTENT.kilocode.documentation,
      });

      const result = await runCLI(["--auto-confirm", pathA, pathB]);

      expectSuccess(result);

      expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
      expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/style.md")).toBe(true);
      expect(await fileExists(pathB, ".kilocode/rules/functional.md")).toBe(
        true,
      );
      expect(await fileExists(pathA, ".kilocode/rules/docs.md")).toBe(true);
    });

    it("should handle files with special characters", async () => {
      const pathA = await createTestProject("project-a", {
        "file with spaces.md": CONTENT.cursor.basic,
        "file-with-dashes.md": CONTENT.cli.basic,
        "file_with_underscores.md": CONTENT.style.basic,
        "file.with.dots.md": CONTENT.kilocode.functional,
      });

      const pathB = await createTestProject("project-b", {});

      const result = await runCLI([
        "--auto-confirm",
        pathA,
        pathB,
        "--rules",
        "*.md",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "file with spaces.md")).toBe(true);
      expect(await fileExists(pathB, "file-with-dashes.md")).toBe(true);
      expect(await fileExists(pathB, "file_with_underscores.md")).toBe(true);
      expect(await fileExists(pathB, "file.with.dots.md")).toBe(true);
    });
  });

  describe("File Types", () => {
    it.each([
      {
        name: "empty files",
        setup: async (pathA: string) => {
          await createFile(path.join(pathA, "empty.md"), "");
        },
        verifyResult: async (result: any) => {
          expectSuccess(result);
        },
        verifyFile: async (pathB: string) => {
          expect(await fileExists(pathB, "empty.md")).toBe(true);
          const content = await import("fs").then((fs) =>
            fs.readFileSync(path.join(pathB, "empty.md"), "utf8"),
          );
          expect(content).toBe("");
        }
      },
      {
        name: "large files",
        setup: async (pathA: string) => {
          const largeFilePath = path.join(pathA, "large.md");
          await createLargeFile(largeFilePath, 2); // 2MB (> 1MB limit)
        },
        verifyResult: async (result: any) => {
          expectSuccess(result); // Should still succeed but skip the large file
          expect(containsInOutput(result, "Rule files should be under 1MB")).toBe(true);
        },
        verifyFile: async (pathB: string) => {
          // Large file should not be synced
          expect(await fileExists(pathB, "large.md")).toBe(false);
        }
      },
      {
        name: "binary-like content in .md files",
        setup: async (pathA: string) => {
          const binaryContent = Buffer.alloc(1024).toString('base64');
          const mdPath = path.join(pathA, "binary-data.md");
          await createFile(mdPath, `# Binary Data\n\n\`\`\`\n${binaryContent}\n\`\`\``);
        },
        verifyResult: async (result: any) => {
          expectSuccess(result);
        },
        verifyFile: async (pathB: string, pathA: string) => {
          expect(await fileExists(pathB, "binary-data.md")).toBe(true);
          const originalContent = await import("fs").then(
            (fs) => fs.readFileSync(path.join(pathA, "binary-data.md"), "utf8"),
          );
          const copiedContent = await import("fs").then(
            (fs) => fs.readFileSync(path.join(pathB, "binary-data.md"), "utf8"),
          );
          expect(copiedContent).toBe(originalContent);
        }
      }
    ])("should handle %s", async ({ setup, verifyResult, verifyFile }) => {
      const pathA = await createTestProject("project-a", {});
      const pathB = await createTestProject("project-b", {});

      await setup(pathA);

      const result = await runCLI([
        pathA,
        pathB,
        "--auto-confirm",
        "--rules",
        "*.md",
      ]);

      await verifyResult(result);
      await verifyFile(pathB, pathA);
    });

    it("should skip symbolic links", async () => {
      const pathA = await createTestProject("project-a", {
        "target.md": "target content",
      });
      const pathB = await createTestProject("project-b", {});

      const targetPath = path.join(pathA, "target.md");
      const linkPath = path.join(pathA, "link.md");

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
        "*.md",
      ]);

      expectSuccess(result);

      expect(await fileExists(pathB, "target.md")).toBe(true);
      expect(await fileExists(pathB, "link.md")).toBe(false);
    });
  });

  // System Integration tests removed based on complexity-to-usefulness ratio:
  // - "should handle deeply nested directories": High complexity, low usefulness (basic glob handles this)
  // - "should handle mixed line endings": Complex CRLF setup, low usefulness (Node.js handles transparently)
  // - "should handle .md files with unusual names": Medium complexity, low usefulness (covered by special chars test)
});
