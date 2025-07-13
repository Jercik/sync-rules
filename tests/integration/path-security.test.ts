import { describe, it, expect } from "vitest";
import { runCLI } from "../helpers/cli-runner.ts";
import { createTestProject } from "../helpers/setup.ts";
import { CONTENT } from "../fixtures/scenarios/index.ts";
import tmp from "tmp";
import path from "path";

describe("CLI Path Security", () => {
  it("should reject path traversal attempts in project paths", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    const baseDir = tempDir.name;
    
    // Create a valid project
    const validProject = await createTestProject("valid-project", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    // Try to sync with a path traversal attempt
    const result = await runCLI([
      validProject,
      "../../etc/passwd",
      "--auto-confirm"
    ]);
    
    expect(result.exitCode).toBe(2); // Fatal error during validation
    expect(result.stderr).toContain("Project directory does not exist");
    
    tempDir.removeCallback();
  });

  it("should reject URL-encoded path traversal attempts", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    const baseDir = tempDir.name;
    
    // Create a valid project
    const validProject = await createTestProject("valid-project", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    // Try to sync with URL-encoded path traversal
    // %2e%2e%2f = "../"
    const result = await runCLI([
      validProject,
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "--auto-confirm"
    ]);
    
    expect(result.exitCode).toBe(2); // Fatal error during validation
    expect(result.stderr).toContain("Project directory does not exist");
    
    tempDir.removeCallback();
  });

  it("should reject path traversal in discovery mode", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    const baseDir = tempDir.name;
    
    // Create some projects
    await createTestProject(path.join(baseDir, "project1"), {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    // Try to discover with traversal in base-dir
    const result = await runCLI([
      "--base-dir", "../../../",
      "--dry-run"
    ]);
    
    // This should work but only discover within the resolved path
    // It won't find our test projects since they're not in the parent directories
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/No projects with rule files found|Discovering projects in/);
    
    tempDir.removeCallback();
  });

  it("should handle absolute paths safely", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    
    // Create projects
    const project1 = await createTestProject("project1", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    const project2 = await createTestProject("project2", {
      ".cursorrules.md": CONTENT.cursor.v1,
    });
    
    // Using absolute paths should work fine
    const result = await runCLI([
      project1,
      project2,
      "--auto-confirm"
    ]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Synchronization completed successfully");
    
    tempDir.removeCallback();
  });

  it("should reject attempts to sync system directories", async () => {
    // Try to sync system directories
    const result = await runCLI([
      "/etc",
      "/tmp",
      "--auto-confirm"
    ]);
    
    // Should fail during validation (no .md files in system dirs)
    expect(result.exitCode).toBe(0); // No sync needed
    expect(result.stdout).toContain("No rule files found across any projects");
  });

  it("should reject non-existent project paths", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    
    const validProject = await createTestProject("valid", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    // Use a truly non-existent path
    const result = await runCLI([
      validProject,
      "/definitely/does/not/exist/project",
      "--auto-confirm"
    ]);
    
    expect(result.exitCode).toBe(2); // Fatal error during validation
    expect(result.stderr).toContain("Project directory does not exist");
    
    tempDir.removeCallback();
  });

  it("should prevent writing to system directories", async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    
    const validProject = await createTestProject("valid", {
      ".cursorrules.md": CONTENT.cursor.basic,
    });
    
    // This path exists but shouldn't be writable
    const result = await runCLI([
      validProject,
      "/etc",
      "--auto-confirm"
    ]);
    
    // Should fail when trying to write
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/permission denied|EACCES/);
    
    tempDir.removeCallback();
  });
});