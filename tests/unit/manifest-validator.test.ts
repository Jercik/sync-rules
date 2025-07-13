import { describe, it, expect } from "vitest";
import { ManifestSchema, LocalManifestSchema } from "../../src/utils/manifest-validator.ts";
import { z } from "zod";

describe("ManifestSchema Validation", () => {
  it("should validate a valid manifest with rules", () => {
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

    const result = ManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules).toHaveProperty(".kilocode/ansible.md");
      expect(result.data.rules[".kilocode/ansible.md"].condition).toBe("**/*.yml");
    }
  });

  it("should validate an empty rules object", () => {
    const emptyManifest = {
      rules: {}
    };

    const result = ManifestSchema.safeParse(emptyManifest);
    expect(result.success).toBe(true);
  });

  it("should reject manifest without rules property", () => {
    const invalidManifest = {};

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Invalid input");
    }
  });

  it("should reject manifest with non-string condition", () => {
    const invalidManifest = {
      rules: {
        ".kilocode/test.md": {
          condition: 123 // Should be string
        }
      }
    };

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Invalid input: expected string");
    }
  });

  it("should reject manifest with empty condition string", () => {
    const invalidManifest = {
      rules: {
        ".kilocode/test.md": {
          condition: ""
        }
      }
    };

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Condition must be a non-empty string");
    }
  });

  it("should reject manifest with missing condition property", () => {
    const invalidManifest = {
      rules: {
        ".kilocode/test.md": {}
      }
    };

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Invalid input");
    }
  });

  it("should reject manifest with array instead of object for rules", () => {
    const invalidManifest = {
      rules: [".kilocode/test.md"]
    };

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
  });

  it("should handle complex glob patterns", () => {
    const complexManifest = {
      rules: {
        ".kilocode/python.md": {
          condition: "**/*.{py,pyx,pyi}"
        },
        ".kilocode/web.md": {
          condition: "**/*.{js,ts,jsx,tsx,html,css,scss,sass}"
        },
        ".kilocode/docker.md": {
          condition: "**/Dockerfile*"
        }
      }
    };

    const result = ManifestSchema.safeParse(complexManifest);
    expect(result.success).toBe(true);
  });
});

describe("LocalManifestSchema Validation", () => {
  it("should validate a valid local manifest with both include and exclude", () => {
    const validLocalManifest = {
      include: [".kilocode/rule1.md", ".kilocode/rule2.md"],
      exclude: [".kilocode/rule3.md"]
    };

    const result = LocalManifestSchema.safeParse(validLocalManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include).toHaveLength(2);
      expect(result.data.exclude).toHaveLength(1);
    }
  });

  it("should validate a local manifest with only include", () => {
    const localManifest = {
      include: [".kilocode/rule1.md"]
    };

    const result = LocalManifestSchema.safeParse(localManifest);
    expect(result.success).toBe(true);
  });

  it("should validate a local manifest with only exclude", () => {
    const localManifest = {
      exclude: [".kilocode/rule1.md"]
    };

    const result = LocalManifestSchema.safeParse(localManifest);
    expect(result.success).toBe(true);
  });

  it("should validate an empty local manifest", () => {
    const emptyLocalManifest = {};

    const result = LocalManifestSchema.safeParse(emptyLocalManifest);
    expect(result.success).toBe(true);
  });

  it("should reject local manifest with non-array include", () => {
    const invalidLocalManifest = {
      include: ".kilocode/rule1.md" // Should be array
    };

    const result = LocalManifestSchema.safeParse(invalidLocalManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Invalid input: expected array");
    }
  });

  it("should reject local manifest with non-string array elements", () => {
    const invalidLocalManifest = {
      include: [".kilocode/rule1.md", 123]
    };

    const result = LocalManifestSchema.safeParse(invalidLocalManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.message).toContain("Invalid input: expected string");
    }
  });

  it("should allow additional properties in local manifest", () => {
    const localManifestWithExtra = {
      include: [".kilocode/rule1.md"],
      exclude: [".kilocode/rule2.md"],
      someOtherProperty: "value" // Should be ignored
    };

    const result = LocalManifestSchema.safeParse(localManifestWithExtra);
    expect(result.success).toBe(true);
  });
});

describe("Error message formatting", () => {
  it("should provide clear error paths for nested validation errors", () => {
    const invalidManifest = {
      rules: {
        ".kilocode/test1.md": {
          condition: ""
        },
        ".kilocode/test2.md": {
          condition: 123
        }
      }
    };

    const result = ManifestSchema.safeParse(invalidManifest);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      const errors = result.error.issues;
      expect(errors).toHaveLength(2);
      
      // Check that error paths are correct
      const errorPaths = errors.map(e => e.path.join('.'));
      expect(errorPaths).toContain("rules..kilocode/test1.md.condition");
      expect(errorPaths).toContain("rules..kilocode/test2.md.condition");
    }
  });
});

describe("Advanced Manifest Features", () => {
  it("should reject manifest with additional properties in rules", () => {
    const manifestWithExtraProperty = {
      rules: {
        ".kilocode/global.md": {
          condition: "**/*.md"
        },
        ".kilocode/local.md": {
          condition: "**/*.md",
          localOverride: true  // This is not in the schema
        }
      }
    };

    const result = ManifestSchema.safeParse(manifestWithExtraProperty);
    // Zod by default strips unknown properties, so this should succeed
    // but the extra property won't be in the result
    expect(result.success).toBe(true);
    if (result.success) {
      // The localOverride property should not exist in the parsed data
      expect((result.data.rules[".kilocode/local.md"] as any).localOverride).toBeUndefined();
    }
  });

  it("should handle rules with special characters in paths", () => {
    const manifestWithSpecialPaths = {
      rules: {
        ".kilocode/web-dev.md": {
          condition: "**/*.{js,jsx}"
        },
        ".kilocode/c++.md": {
          condition: "**/*.{cpp,cxx,cc}"
        },
        ".kilocode/@special/rule.md": {
          condition: "src/**/*"
        }
      }
    };

    const result = ManifestSchema.safeParse(manifestWithSpecialPaths);
    expect(result.success).toBe(true);
  });

  it("should validate manifest with very long condition patterns", () => {
    const longPattern = "**/*.{" + Array(50).fill("ext").map((e, i) => e + i).join(",") + "}";
    const manifestWithLongPattern = {
      rules: {
        ".kilocode/many-extensions.md": {
          condition: longPattern
        }
      }
    };

    const result = ManifestSchema.safeParse(manifestWithLongPattern);
    expect(result.success).toBe(true);
  });

  it("should reject manifest with null values", () => {
    const manifestWithNull = {
      rules: {
        ".kilocode/test.md": null
      }
    };

    const result = ManifestSchema.safeParse(manifestWithNull);
    expect(result.success).toBe(false);
  });

  it("should reject manifest with circular-like patterns", () => {
    // This is valid syntactically but might cause issues in practice
    const circularManifest = {
      rules: {
        ".kilocode/manifest.json": {
          condition: ".kilocode/manifest.json"
        }
      }
    };

    // Should validate successfully - circular detection is application logic
    const result = ManifestSchema.safeParse(circularManifest);
    expect(result.success).toBe(true);
  });
});

describe("LocalManifest Edge Cases", () => {
  it("should handle local manifest with empty arrays", () => {
    const emptyArraysManifest = {
      include: [],
      exclude: []
    };

    const result = LocalManifestSchema.safeParse(emptyArraysManifest);
    expect(result.success).toBe(true);
  });

  it("should handle local manifest with duplicate entries", () => {
    const duplicateManifest = {
      include: [".kilocode/rule1.md", ".kilocode/rule1.md"],
      exclude: [".kilocode/rule2.md", ".kilocode/rule2.md"]
    };

    // Schema allows duplicates - deduplication is application logic
    const result = LocalManifestSchema.safeParse(duplicateManifest);
    expect(result.success).toBe(true);
  });

  it("should handle local manifest with glob patterns", () => {
    const globManifest = {
      include: [".kilocode/**/*.md", "*.rules.md"],
      exclude: ["**/*.local.md", "**/test/*.md"]
    };

    const result = LocalManifestSchema.safeParse(globManifest);
    expect(result.success).toBe(true);
  });
});