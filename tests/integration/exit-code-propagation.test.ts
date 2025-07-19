import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { executeUnifiedSync } from "../../src/cli.ts";
import type { ProjectInfo } from "../../src/discovery.ts";
import * as logger from "../../src/utils/core.ts";

describe("Exit Code Propagation", () => {
  const testDir = path.join(process.cwd(), "test-exit-codes");
  let logSpy: ReturnType<typeof vi.spyOn>;
  let logWarnSpy: ReturnType<typeof vi.spyOn>;
  let logErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    logSpy = vi.spyOn(logger, "log");
    logWarnSpy = vi.spyOn(logger, "warn");
    logErrorSpy = vi.spyOn(logger, "error");
  });

  afterEach(async () => {
    // Try to restore permissions before cleanup
    try {
      // Restore any permission-restricted directories/files
      const dirs = await fs.readdir(testDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const dirPath = path.join(testDir, dir.name);
          await fs.chmod(dirPath, 0o755).catch(() => {});
          
          // Also restore permissions for rules directories
          const rulesPath = path.join(dirPath, ".kilocode/rules");
          await fs.chmod(rulesPath, 0o755).catch(() => {});
          
          // Restore permissions for all files in rules directory
          try {
            const files = await fs.readdir(rulesPath);
            for (const file of files) {
              await fs.chmod(path.join(rulesPath, file), 0o644).catch(() => {});
            }
          } catch {}
        }
      }
    } catch {}
    
    await fs.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should return exit code 0 when both sync and generation succeed", async () => {
    // Create two projects with identical files
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    
    // Create manifests
    const manifestContent = ".kilocode/rules/test.md\n";
    await fs.writeFile(path.join(project1, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project2, ".kilocode/rules/manifest.txt"), manifestContent);
    
    // Create identical files (no sync needed)
    const content = "# Test Rule\nContent";
    await fs.writeFile(path.join(project1, ".kilocode/rules/test.md"), content);
    await fs.writeFile(path.join(project2, ".kilocode/rules/test.md"), content);
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
    ];
    
    const exitCode = await executeUnifiedSync(projects, {
      rules: ["**/*.md"],
      exclude: [],
      dryRun: false,
      autoConfirm: true,
      generateClaude: true,
    });
    
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No synchronization needed"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Generation Summary: 2 generated"));
  });

  it("should return exit code 1 when sync fails but generation succeeds", async () => {
    // Create a scenario where sync will fail
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    const project3 = path.join(testDir, "project3");
    
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project3, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project3, ".kilocode/rules"), { recursive: true });
    
    // Create manifests
    const manifestContent = ".kilocode/rules/test.md\n";
    await fs.writeFile(path.join(project1, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project2, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project3, ".kilocode/rules/manifest.txt"), manifestContent);
    
    // Create a file only in project1 - it will need to sync to project2 and project3
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/test.md"),
      "# Test Rule"
    );
    
    // Make project3's rules directory read-only to cause sync failure for one action
    // This will cause the "add" action to project3 to fail
    await fs.chmod(path.join(project3, ".kilocode/rules"), 0o555);
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
      { name: "project3", path: project3 },
    ];
    
    const exitCode = await executeUnifiedSync(projects, {
      rules: ["**/*.md"],
      exclude: [],
      dryRun: false,
      autoConfirm: true,
      generateClaude: true,
    });
    
    // Should return 1 because sync had errors, even if generation succeeds
    expect(exitCode).toBe(1);
    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to execute"),
      expect.any(Error)
    );
    expect(logWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("errors detected")
    );
    
    // Restore permissions for cleanup
    await fs.chmod(path.join(project3, ".kilocode/rules"), 0o755);
  });

  it("should return exit code 1 when sync succeeds but generation fails", async () => {
    // Create projects with files to sync
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    
    // Create manifests
    const manifestContent = ".kilocode/rules/test.md\n";
    await fs.writeFile(path.join(project1, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project2, ".kilocode/rules/manifest.txt"), manifestContent);
    
    // Only project1 has a file (will sync to project2)
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/test.md"),
      "# Test Rule"
    );
    
    // Make project2 directory read-only to cause CLAUDE.md generation failure
    await fs.chmod(project2, 0o555);
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
    ];
    
    const exitCode = await executeUnifiedSync(projects, {
      rules: ["**/*.md"],
      exclude: [],
      dryRun: false,
      autoConfirm: true,
      generateClaude: true,
    });
    
    // Should return 1 because generation failed, even though sync succeeded
    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Synchronization completed successfully!"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("errors"));
    
    // Restore permissions for cleanup
    await fs.chmod(project2, 0o755);
  });

  it("should return exit code 1 when both sync and generation fail", async () => {
    // Create projects
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    
    // Create manifests
    const manifestContent = ".kilocode/rules/test.md\n";
    await fs.writeFile(path.join(project1, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project2, ".kilocode/rules/manifest.txt"), manifestContent);
    
    // Create files
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/test.md"),
      "# Test Rule v1"
    );
    await fs.writeFile(
      path.join(project2, ".kilocode/rules/test.md"),
      "# Test Rule v2"
    );
    
    // Make both project directories read-only to cause failures
    await fs.chmod(path.join(project1, ".kilocode/rules/test.md"), 0o444);
    await fs.chmod(path.join(project2, ".kilocode/rules/test.md"), 0o444);
    await fs.chmod(project1, 0o555);
    await fs.chmod(project2, 0o555);
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
    ];
    
    const exitCode = await executeUnifiedSync(projects, {
      rules: ["**/*.md"],
      exclude: [],
      dryRun: false,
      autoConfirm: true,
      generateClaude: true,
    });
    
    // Should return 1 (not 2) because we use Math.max(1, 1)
    expect(exitCode).toBe(1);
    expect(logWarnSpy).toHaveBeenCalledWith(expect.stringContaining("errors detected"));
    
    // Restore permissions for cleanup
    await fs.chmod(project1, 0o755);
    await fs.chmod(project2, 0o755);
    await fs.chmod(path.join(project1, ".kilocode/rules/test.md"), 0o644);
    await fs.chmod(path.join(project2, ".kilocode/rules/test.md"), 0o644);
  });

  it("should still generate CLAUDE.md even when sync has errors", async () => {
    // This tests that the fix allows generation to run even after sync failures
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    const project3 = path.join(testDir, "project3");
    
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project3, ".kilocode"), { recursive: true });
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project3, ".kilocode/rules"), { recursive: true });
    
    // Create manifests
    const manifestContent = ".kilocode/rules/test.md\n";
    await fs.writeFile(path.join(project1, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project2, ".kilocode/rules/manifest.txt"), manifestContent);
    await fs.writeFile(path.join(project3, ".kilocode/rules/manifest.txt"), manifestContent);
    
    // Create a file only in project1
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/test.md"),
      "# Test Rule"
    );
    
    // Make project3's rules directory read-only to cause sync failure for one action
    await fs.chmod(path.join(project3, ".kilocode/rules"), 0o555);
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
      { name: "project3", path: project3 },
    ];
    
    logSpy.mockClear();
    
    const exitCode = await executeUnifiedSync(projects, {
      rules: ["**/*.md"],
      exclude: [],
      dryRun: false,
      autoConfirm: true,
      generateClaude: true,
    });
    
    // Check that generation was attempted despite sync failure
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Starting CLAUDE.md generation"));
    expect(exitCode).toBe(1);
    
    // Restore permissions
    await fs.chmod(path.join(project3, ".kilocode/rules"), 0o755);
  });
});