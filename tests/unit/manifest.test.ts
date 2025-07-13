import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ManifestSchema, LocalManifestSchema } from "../../src/utils/manifest-validator.ts";

// Since shouldIncludeRule is not exported, we'll test it through the multi-sync module
// This test focuses on the manifest logic and validation

describe("Manifest Conditions", () => {
  it("should correctly parse and validate manifest JSON", () => {
    const validManifest = {
      rules: {
        ".kilocode/ansible.md": {
          condition: "**/*.yml"
        },
        ".kilocode/terraform.md": {
          condition: "**/*.tf"
        }
      }
    };
    
    // Should parse without errors
    const manifest = JSON.parse(JSON.stringify(validManifest));
    expect(manifest.rules).toBeDefined();
    expect(manifest.rules[".kilocode/ansible.md"]).toBeDefined();
    expect(manifest.rules[".kilocode/ansible.md"].condition).toBe("**/*.yml");
    
    // Should also pass validation
    const result = ManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it("should correctly parse local manifest overrides", () => {
    const validLocalManifest = {
      include: [".kilocode/rule1.md", ".kilocode/rule2.md"],
      exclude: [".kilocode/rule3.md"]
    };
    
    const manifest = JSON.parse(JSON.stringify(validLocalManifest));
    expect(manifest.include).toHaveLength(2);
    expect(manifest.exclude).toHaveLength(1);
    expect(manifest.include).toContain(".kilocode/rule1.md");
    
    // Should also pass validation
    const result = LocalManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it("should handle manifest with complex glob patterns", () => {
    const complexManifest = {
      rules: {
        ".kilocode/python.md": {
          condition: "**/*.{py,pyx,pyi}"
        },
        ".kilocode/web.md": {
          condition: "**/*.{js,ts,jsx,tsx,html,css}"
        },
        ".kilocode/docker.md": {
          condition: "**/Dockerfile*"
        }
      }
    };
    
    const manifest = JSON.parse(JSON.stringify(complexManifest));
    expect(Object.keys(manifest.rules)).toHaveLength(3);
    expect(manifest.rules[".kilocode/python.md"].condition).toContain("{py,pyx,pyi}");
  });
  
  it("should fail validation for manifests with invalid structures", () => {
    const invalidManifests = [
      // Non-string condition
      {
        rules: {
          ".kilocode/test.md": {
            condition: 123
          }
        }
      },
      // Missing condition property
      {
        rules: {
          ".kilocode/test.md": {}
        }
      },
      // Empty string condition
      {
        rules: {
          ".kilocode/test.md": {
            condition: ""
          }
        }
      },
      // Rules as array instead of object
      {
        rules: []
      },
      // Missing rules property entirely
      {}
    ];
    
    invalidManifests.forEach((invalidManifest, index) => {
      const result = ManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
    });
  });
  
  it("should fail validation for local manifests with invalid structures", () => {
    const invalidLocalManifests = [
      // Include as string instead of array
      {
        include: ".kilocode/rule1.md"
      },
      // Exclude with non-string elements
      {
        exclude: [".kilocode/rule1.md", 123]
      },
      // Include with non-string elements
      {
        include: [true, false]
      }
    ];
    
    invalidLocalManifests.forEach((invalidManifest, index) => {
      const result = LocalManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
    });
  });
});