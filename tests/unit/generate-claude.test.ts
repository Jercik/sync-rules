import { describe, it, expect, beforeEach } from "vitest";
import { generateClaudeMd } from "../../src/generate-claude.ts";
import { createTestProject } from "../helpers/setup.ts";
import type { MultiSyncOptions } from "../../src/multi-sync.ts";

describe("generateClaudeMd", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTestProject("generate-claude-test", {
      ".clinerules.md":
        "# CLI Rules\n\nAlways use TypeScript.\nWrite clean code.",
      ".cursorrules.md": "# Cursor Rules\n\nUse modern JavaScript features.",
      ".kilocode/rules.md": "# Kilocode Rules\n\nFollow best practices.",
      ".kilocode/style.md": "# Style Guide\n\nUse 2 spaces for indentation.",
      "src/index.ts": "export const test = true;",
      "README.md": "# Test Project",
      ".clinerules": "This is not an .md file and should be ignored",
      ".kilocode/config.json": '{ "setting": "value" }',
    });
  });

  it("should generate CLAUDE.md with all .md rule files using minimal concatenation", async () => {
    const options: MultiSyncOptions = {
      rulePatterns: [".clinerules.md", ".cursorrules.md", ".kilocode"],
      excludePatterns: ["node_modules", ".git"],
      dryRun: false,
      autoConfirm: false,
      baseDir: projectPath,
    };

    const content = await generateClaudeMd(projectPath, options);

    expect(content).toContain("# CLAUDE.md - Rules for Claude Code");

    // With minimal concatenation, there should be no "## Rules from" headers
    expect(content).not.toContain("## Rules from");

    // Content should be included directly
    expect(content).toContain("# CLI Rules");
    expect(content).toContain("Always use TypeScript.");
    expect(content).toContain("# Cursor Rules");
    expect(content).toContain("Use modern JavaScript features.");
    expect(content).toContain("# Kilocode Rules");
    expect(content).toContain("Follow best practices.");
    expect(content).toContain("# Style Guide");
    expect(content).toContain("Use 2 spaces for indentation.");

    // Non-.md files should not be included
    expect(content).not.toContain("This is not an .md file");
    expect(content).not.toContain("setting");
  });

  it("should handle patterns correctly and only include .md files", async () => {
    const options: MultiSyncOptions = {
      rulePatterns: [".clinerules.md", ".kilocode"],
      excludePatterns: ["node_modules", ".git"],
      dryRun: false,
      autoConfirm: false,
      baseDir: projectPath,
    };

    const content = await generateClaudeMd(projectPath, options);

    // With minimal concatenation and .md-only constraint
    expect(content).toContain("# CLI Rules"); // From .clinerules.md
    expect(content).not.toContain("# Cursor Rules"); // .cursorrules.md not in patterns
    expect(content).toContain("# Kilocode Rules"); // From .kilocode/rules.md
    expect(content).toContain("# Style Guide"); // From .kilocode/style.md

    // Should not include non-.md files
    expect(content).not.toContain("This is not an .md file");
    expect(content).not.toContain("setting");
  });

  it("should exclude files based on exclude patterns", async () => {
    await createTestProject("generate-claude-exclude-test", {
      ".clinerules.md": "# CLI Rules",
      ".cursorrules.md": "# Cursor Rules",
      ".git/rules.md": "git rules",
      "node_modules/package/rules.md": "npm rules",
      "memory-bank/context.md": "# Memory Context",
    });

    const options: MultiSyncOptions = {
      rulePatterns: ["**"],
      excludePatterns: ["node_modules", ".git", "memory-bank"],
      dryRun: false,
      autoConfirm: false,
      baseDir: projectPath,
    };

    const content = await generateClaudeMd(projectPath, options);

    expect(content).not.toContain("git rules");
    expect(content).not.toContain("npm rules");
    expect(content).not.toContain("Memory Context");
  });

  it("should handle unreadable files gracefully", async () => {
    const testPath = await createTestProject("generate-claude-unreadable", {
      ".clinerules.md": "# CLI Rules",
    });

    // Mock a file read error by using a non-existent file in the pattern
    const options: MultiSyncOptions = {
      rulePatterns: [".clinerules.md", ".nonexistent.md"],
      excludePatterns: [],
      dryRun: false,
      autoConfirm: false,
      baseDir: testPath,
    };

    const content = await generateClaudeMd(testPath, options);

    expect(content).toContain("# CLI Rules");
    // Should not contain any error indicators for non-existent files
    expect(content).not.toContain("*[File content could not be read]*");
  });

  it("should sort files for consistent output", async () => {
    const options: MultiSyncOptions = {
      rulePatterns: [".clinerules.md", ".cursorrules.md", ".kilocode"],
      excludePatterns: [],
      dryRun: false,
      autoConfirm: false,
      baseDir: projectPath,
    };

    const content1 = await generateClaudeMd(projectPath, options);
    const content2 = await generateClaudeMd(projectPath, options);

    expect(content1).toBe(content2);

    // Check order (files should be sorted, content should appear in that order)
    const cliRules = content1.indexOf("# CLI Rules");
    const cursorRules = content1.indexOf("# Cursor Rules");
    const kilocodeRules = content1.indexOf("# Kilocode Rules");
    const styleGuide = content1.indexOf("# Style Guide");

    expect(cliRules).toBeLessThan(cursorRules);
    expect(cursorRules).toBeLessThan(kilocodeRules);
    expect(kilocodeRules).toBeLessThan(styleGuide);
  });

  it("should handle empty directories gracefully", async () => {
    const emptyPath = await createTestProject("generate-claude-empty", {});

    const options: MultiSyncOptions = {
      rulePatterns: [".clinerules.md", ".cursorrules.md"],
      excludePatterns: [],
      dryRun: false,
      autoConfirm: false,
      baseDir: emptyPath,
    };

    const content = await generateClaudeMd(emptyPath, options);

    expect(content).toContain("# CLAUDE.md - Rules for Claude Code");
    // With no .md files matching the patterns, should just have the header
    expect(content.trim()).toBe("# CLAUDE.md - Rules for Claude Code");
  });
});
