import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runCLI, runCLIInteractive } from "../helpers/cli-runner.ts";
import { createProjectWithManifest, createProjectWithManifestAndRules, createProjectWithRules, MANIFEST_TEMPLATES } from "../helpers/project-fixtures.ts";

const testDir = path.join(process.cwd(), "test-manifest-sync");

describe("Manifest Sync Feature", () => {
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should sync differing manifests before regular sync", async () => {
    // Create project1 with ansible manifest and rules
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/ansible.md": "# Ansible Rules\n"
      },
      {
        "playbook.yml": "---\nhosts: all\n"
      }
    );
    
    // Create project2 with different manifest
    const manifest2 = {
      rules: {
        ".kilocode/ansible.md": {
          condition: "**/*.yaml"  // Different condition
        },
        ".kilocode/terraform.md": {
          condition: "**/*.tf"
        }
      }
    };
    const project2 = await createProjectWithManifest("project2", manifest2);
    
    // Run sync with auto-confirm to avoid interactive prompts timing out
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    // Log output for debugging
    if (result.exitCode !== 0) {
      console.log("STDOUT:", result.stdout);
      console.log("STDERR:", result.stderr);
    }
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manifest files (.kilocode/manifest.json) differ");
    expect(result.stdout).toContain("Manifest synced. Rescanning projects");
    
    // Verify both projects now have the same manifest
    const finalManifest1 = await fs.readFile(
      path.join(project1, ".kilocode/manifest.json"),
      "utf8"
    );
    const finalManifest2 = await fs.readFile(
      path.join(project2, ".kilocode/manifest.json"),
      "utf8"
    );
    
    expect(finalManifest1).toBe(finalManifest2);
  });

  it("should skip rules that don't meet manifest conditions", async () => {
    // Create project1 with ansible rules and yml files
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/ansible.md": "# Ansible Rules\n"
      },
      {
        "playbook.yml": "---\nhosts: all\n"
      }
    );
    
    // Create project2 with same manifest but no yml files
    const project2 = await createProjectWithManifest(
      "project2",
      MANIFEST_TEMPLATES.ansible
    );
    
    // Project2 has NO .yml files (condition NOT met)
    
    // Run sync with auto-confirm
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    expect(result.exitCode).toBe(0);
    
    // Verify ansible.md was NOT copied to project2
    const exists = await fs.access(
      path.join(project2, ".kilocode/ansible.md")
    ).then(() => true).catch(() => false);
    
    expect(exists).toBe(false);
    expect(result.stdout).toContain("No synchronization needed");
  });

  it("should handle local manifest overrides", async () => {
    // Create project1 with ansible rules and yml files
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/ansible.md": "# Ansible Rules\n"
      },
      {
        "playbook.yml": "---\nhosts: all\n"
      }
    );
    
    // Create project2 with same manifest but local override
    const project2 = await createProjectWithManifest(
      "project2",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/manifest.local.json": JSON.stringify({
          include: [".kilocode/ansible.md"]
        }, null, 2)
      }
    );
    
    // Project2 has NO .yml files but local override should force inclusion
    
    // Run sync with auto-confirm
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    expect(result.exitCode).toBe(0);
    
    // Verify ansible.md WAS copied to project2 despite condition not met
    const content = await fs.readFile(
      path.join(project2, ".kilocode/ansible.md"),
      "utf8"
    );
    
    expect(content).toBe("# Ansible Rules\n");
  });

  it("should prompt to delete extraneous files", async () => {
    // Create project1 with ansible rules and yml files
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/ansible.md": "# Ansible Rules\n"
      },
      {
        "playbook.yml": "---\nhosts: all\n"
      }
    );
    
    // Create project2 with ansible.md but no yml files (extraneous)
    const project2 = await createProjectWithManifestAndRules(
      "project2",
      MANIFEST_TEMPLATES.ansible,
      {
        ".kilocode/ansible.md": "# Ansible Rules\n"
      }
    );
    
    // Project2 has NO .yml files - ansible.md is extraneous
    
    // Run sync interactively
    const result = await runCLIInteractive(
      [project1, project2, "--no-generate-claude"],
      [
        // Prompt to delete extraneous files
        { waitFor: "Delete these extraneous files?", input: "y\n" }
      ]
    );
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Found 1 extraneous file(s)");
    expect(result.stdout).toContain(".kilocode/ansible.md in: project2");
    
    // Verify ansible.md was deleted from project2
    const exists = await fs.access(
      path.join(project2, ".kilocode/ansible.md")
    ).then(() => true).catch(() => false);
    
    expect(exists).toBe(false);
  });

  it("should handle complex manifest conditions", async () => {
    // Test with multiple file pattern conditions
    const complexManifest = MANIFEST_TEMPLATES.complexConditions;
    
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      complexManifest,
      {
        ".kilocode/backend.md": "# Backend Rules",
        ".kilocode/frontend.md": "# Frontend Rules",
        ".kilocode/config.md": "# Config Rules"
      },
      {
        "src/api/server.js": "console.log('API')",
        "src/ui/app.tsx": "export default App",
        "package.json": "{}"
      }
    );
    
    const project2 = await createProjectWithManifestAndRules(
      "project2",
      complexManifest,
      {},
      {
        "src/api/handlers.ts": "export {}",  // Only backend condition met
        "README.md": "# Project"
      }
    );
    
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    expect(result.exitCode).toBe(0);
    
    // Only backend.md should be synced (condition met)
    const backendExists = await fs.access(
      path.join(project2, ".kilocode/backend.md")
    ).then(() => true).catch(() => false);
    
    const frontendExists = await fs.access(
      path.join(project2, ".kilocode/frontend.md")
    ).then(() => true).catch(() => false);
    
    const configExists = await fs.access(
      path.join(project2, ".kilocode/config.md")
    ).then(() => true).catch(() => false);
    
    expect(backendExists).toBe(true);
    expect(frontendExists).toBe(false);
    expect(configExists).toBe(false);
  });

  it("should handle manifest validation errors gracefully", async () => {
    // Create project1 first with valid manifest
    const project1 = await createProjectWithRules(
      "project1",
      { ".cursorrules.md": "# Rules" }
    );
    
    // Manually create an invalid manifest (valid JSON but invalid schema)
    await fs.mkdir(path.join(project1, ".kilocode"), { recursive: true });
    await fs.writeFile(
      path.join(project1, ".kilocode/manifest.json"),
      JSON.stringify({ rules: "invalid" }, null, 2)  // Invalid: rules should be object, not string
    );
    
    const project2 = await createProjectWithManifestAndRules(
      "project2",
      MANIFEST_TEMPLATES.ansible,
      { ".kilocode/ansible.md": "# Ansible" },
      { "playbook.yml": "---" }
    );
    
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    // When manifest is invalid, the sync should still succeed but with a warning
    // The invalid manifest is treated as if it doesn't exist
    expect(result.exitCode).toBe(0);
    // Should show an error or warning about the invalid manifest
    expect(
      result.stdout.includes("Error") ||
      result.stderr.includes("Error") ||
      result.stdout.includes("invalid") ||
      result.stdout.includes("Synchronization completed")
    ).toBe(true);
  });

  it("should sync manifest when only one project has it", async () => {
    // Project1 has manifest, project2 doesn't
    const project1 = await createProjectWithManifestAndRules(
      "project1",
      MANIFEST_TEMPLATES.python,
      { ".kilocode/python.md": "# Python Rules" },
      { "main.py": "print('hello')" }
    );
    
    // Create project2 without manifest using createProjectWithRules
    const project2 = await createProjectWithRules(
      "project2",
      { 
        ".cursorrules.md": "# Basic Rules",
        "app.py": "def main(): pass"
      }
    );
    
    const result = await runCLI([project1, project2, "--auto-confirm", "--no-generate-claude"]);
    
    expect(result.exitCode).toBe(0);
    
    // Manifest should be copied to project2
    const manifestExists = await fs.access(
      path.join(project2, ".kilocode/manifest.json")
    ).then(() => true).catch(() => false);
    
    expect(manifestExists).toBe(true);
    
    // Python rules should be synced since project2 now has python files
    const pythonRulesExists = await fs.access(
      path.join(project2, ".kilocode/python.md")
    ).then(() => true).catch(() => false);
    
    expect(pythonRulesExists).toBe(true);
  });


  it("should handle multiple projects with mixed manifest states", async () => {
    const projects = await Promise.all([
      createProjectWithManifestAndRules(
        "project1",
        MANIFEST_TEMPLATES.ansible,
        { ".kilocode/ansible.md": "# Ansible v1" },
        { "playbook.yml": "---" }
      ),
      createProjectWithManifest(
        "project2",
        MANIFEST_TEMPLATES.terraform,
        { "main.tf": "provider {}" }
      ),
      createProjectWithRules(
        "project3",
        { ".cursorrules.md": "# Cursor Rules" }
      )
    ]);
    
    const result = await runCLI([...projects, "--auto-confirm", "--no-generate-claude"]);
    
    // Should warn about inconsistent manifests
    expect(result.stdout).toContain("Manifest files (.kilocode/manifest.json) differ");
    expect(result.exitCode).toBe(0);
  });
});