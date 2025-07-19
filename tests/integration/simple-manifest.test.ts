import { describe, it, expect } from "vitest";
import { runCLI, runCLIWithInput } from "../helpers/cli-runner.ts";
import { createTestProject } from "../helpers/setup.ts";
import { CONTENT } from "../fixtures/scenarios/index.ts";
import { promises as fs } from "node:fs";
import path from "node:path";

async function fileExists(projectPath: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("Per-Project Manifest", () => {
  it("should only sync rules listed in target project's manifest", async () => {
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
      ".clinerules.md": CONTENT.cli.basic,
      ".kilocode/setup.md": CONTENT.kilocode.functional,
    });

    const pathB = await createTestProject("project-b", {});
    // Create manifest.txt in project-b listing only two rules
    await fs.mkdir(path.join(pathB, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathB, ".kilocode/rules/manifest.txt"),
      ".cursorrules.md\n.clinerules.md\n"
    );

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);

    // Only listed rules should be synced
    expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
    expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
    expect(await fileExists(pathB, ".kilocode/setup.md")).toBe(false);
  });

  it("should skip sync if target has no manifest", async () => {
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });

    const pathB = await createTestProject("project-b", {});  // No manifest

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    expect(await fileExists(pathB, ".cursorrules.md")).toBe(false);
  });

  it("should report orphaned rules in manifests", async () => {
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });

    const pathB = await createTestProject("project-b", {});
    // Create manifest.txt with a rule that doesn't exist
    await fs.mkdir(path.join(pathB, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathB, ".kilocode/rules/manifest.txt"),
      ".cursorrules.md\n.nonexistent-rule.md\n"
    );

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/Found orphaned rules in manifests/);
    expect(result.stderr).toMatch(/project-b.*nonexistent-rule\.md.*not found in any project/);
  });

  it("should handle empty lines and comments in manifest", async () => {
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
      ".clinerules.md": CONTENT.cli.basic,
    });

    const pathB = await createTestProject("project-b", {});
    // Create manifest.txt with empty lines and comments (which should be ignored)
    await fs.mkdir(path.join(pathB, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathB, ".kilocode/rules/manifest.txt"),
      "\n.cursorrules.md\n\n   \n.clinerules.md\n  \n"
    );

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
    expect(await fileExists(pathB, ".clinerules.md")).toBe(true);
  });

  it("should not report local files in manifests as orphaned", async () => {
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
      ".cursorrules.local.md": CONTENT.local.debugConsole, // Local file exists in project A
    });

    const pathB = await createTestProject("project-b", {
      ".clinerules.local.md": CONTENT.local.apiEndpoints, // Local file exists in project B
    });
    
    // Create manifest.txt in project-b listing both regular and local rules
    await fs.mkdir(path.join(pathB, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathB, ".kilocode/rules/manifest.txt"),
      ".cursorrules.md\n.clinerules.local.md\n.cursorrules.local.md\n"
    );

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    
    // Regular rule should sync normally
    expect(await fileExists(pathB, ".cursorrules.md")).toBe(true);
    
    // Local files should remain unchanged (not synced)
    expect(await fileExists(pathB, ".clinerules.local.md")).toBe(true);
    expect(await fileExists(pathB, ".cursorrules.local.md")).toBe(false); // Not copied from A
    
    // Most importantly: no orphaned warnings should be generated for local files
    expect(result.stderr).not.toMatch(/Found orphaned rules in manifests/);
    expect(result.stderr).not.toMatch(/\.local\./);
  });

  it("should delete all rule files from projects with empty manifests", async () => {
    // Create project A with some rule files
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
      ".clinerules.md": CONTENT.cli.basic,
    });

    // Create project B with existing rule files
    const pathB = await createTestProject("project-b", {
      ".cursorrules.md": CONTENT.cursor.basic,
      ".clinerules.md": CONTENT.cli.basic,
    });

    // Create empty manifest in project B
    await fs.mkdir(path.join(pathB, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathB, ".kilocode/rules/manifest.txt"),
      "" // Empty manifest
    );

    const result = await runCLI([pathA, pathB, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    
    // Project B should have all its rule files deleted
    expect(await fileExists(pathB, ".cursorrules.md")).toBe(false);
    expect(await fileExists(pathB, ".clinerules.md")).toBe(false);
    
    // Project A should still have its files
    expect(await fileExists(pathA, ".cursorrules.md")).toBe(true);
    expect(await fileExists(pathA, ".clinerules.md")).toBe(true);

    // Check that deletion actions were created
    expect(result.stdout).toMatch(/Deletions: 2/);
  });
  
  it("should show warning for empty manifests in interactive mode", async () => {
    // Create project A with some rule files
    const pathA = await createTestProject("project-a", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });

    // Create project B with existing rule files but no manifest
    const pathB = await createTestProject("project-b", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });

    // Create project C with empty manifest
    const pathC = await createTestProject("project-c", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    await fs.mkdir(path.join(pathC, ".kilocode/rules"), { recursive: true });
    await fs.writeFile(
      path.join(pathC, ".kilocode/rules/manifest.txt"),
      "" // Empty manifest
    );

    // Run in interactive mode but answer "n" to skip changes
    const result = await runCLIWithInput([pathA, pathB, pathC], ["n", "n"]);

    expect(result.exitCode).toBe(0);
    
    // Check that project C was warned about empty manifest
    expect(result.stdout).toMatch(/Project 'project-c' has an empty manifest but contains 1 rule files/);
    expect(result.stdout).toMatch(/Delete all rule files from project 'project-c'/);
    
    // Since we answered "n", files should still exist
    expect(await fileExists(pathC, ".cursorrules.md")).toBe(true);
  });

  it("should handle multiple projects with empty manifests when all files are identical", async () => {
    // Create 5 projects with identical files
    const projects: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const projectPath = await createTestProject(`project-${i}`, {
        ".cursorrules.md": CONTENT.cursor.basic,
        ".clinerules.md": CONTENT.cli.basic,
      });
      projects.push(projectPath);
      
      // Projects 2, 3, and 4 have empty manifests
      if (i >= 2 && i <= 4) {
        await fs.mkdir(path.join(projectPath, ".kilocode/rules"), { recursive: true });
        await fs.writeFile(
          path.join(projectPath, ".kilocode/rules/manifest.txt"),
          "" // Empty manifest
        );
      }
    }

    // Run in auto-confirm mode
    const result = await runCLI([...projects, "--auto-confirm"]);

    expect(result.exitCode).toBe(0);
    
    // Projects 2, 3, and 4 should have their files deleted
    for (let i = 2; i <= 4; i++) {
      expect(await fileExists(projects[i-1], ".cursorrules.md")).toBe(false);
      expect(await fileExists(projects[i-1], ".clinerules.md")).toBe(false);
    }
    
    // Projects 1 and 5 should still have their files
    expect(await fileExists(projects[0], ".cursorrules.md")).toBe(true);
    expect(await fileExists(projects[0], ".clinerules.md")).toBe(true);
    expect(await fileExists(projects[4], ".cursorrules.md")).toBe(true);
    expect(await fileExists(projects[4], ".clinerules.md")).toBe(true);

    // Check that deletion actions were performed
    expect(result.stdout).toMatch(/Deletions: 6/); // 2 files × 3 projects
  });
});