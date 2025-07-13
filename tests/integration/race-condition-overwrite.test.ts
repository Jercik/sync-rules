import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { scanAllProjects, getUserConfirmations } from "../../src/multi-sync.ts";
import type { MultiSyncOptions } from "../../src/multi-sync.ts";
import type { ProjectInfo } from "../../src/discovery.ts";
import * as logger from "../../src/utils/core.ts";

describe("Race Condition Overwrite Scenario", () => {
  const testDir = path.join(process.cwd(), "test-race-overwrite");
  let logWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    logWarnSpy = vi.spyOn(logger, "warn");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should warn about potential overwrites for files created between scan and execution", async () => {
    // This test demonstrates the exact scenario from the issue:
    // 1. Project1 has api.md
    // 2. Project2 doesn't have api.md during scan
    // 3. Between scan and execution, someone creates api.md in project2
    // 4. The "add" action would overwrite this newly created file
    
    // Create two projects
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    
    // Only project1 has the file initially
    const rulesPath1 = path.join(project1, ".kilocode/rules/api.md");
    await fs.writeFile(rulesPath1, "# API Rules\nFrom project1");
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
    ];
    
    const options: MultiSyncOptions = {
      rulePatterns: ["**/*.md"],
      excludePatterns: [],
      dryRun: true,
      autoConfirm: true,
    };
    
    // First, scan the projects (project2 won't have the file)
    const fileStates = await scanAllProjects(projects, options);
    
    // Now, simulate someone creating the file in project2 AFTER the scan
    const rulesPath2 = path.join(project2, ".kilocode/rules/api.md");
    await fs.writeFile(rulesPath2, "# Local API Rules\nCreated after scan!");
    
    // Get confirmations (which includes the overwrite check)
    const actions = await getUserConfirmations(fileStates, options, projects);
    
    // Check warnings
    const warnings = logWarnSpy.mock.calls.map(call => call[0]);
    console.log("Race condition warnings:", warnings);
    
    // Should warn about the potential overwrite
    expect(warnings.some(w => w.includes("WARNING: Auto-confirm will OVERWRITE"))).toBe(true);
    expect(warnings.some(w => w.includes("api.md in project2 (file already exists!)"))).toBe(true);
  });

  it("verifies the fix prevents silent overwrites in auto-confirm mode", async () => {
    // Setup similar scenario but with multiple files
    const project1 = path.join(testDir, "project1");
    const project2 = path.join(testDir, "project2");
    const project3 = path.join(testDir, "project3");
    
    await fs.mkdir(path.join(project1, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project2, ".kilocode/rules"), { recursive: true });
    await fs.mkdir(path.join(project3, ".kilocode/rules"), { recursive: true });
    
    // Project1 has two files
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/config.md"),
      "# Config Rules"
    );
    await fs.writeFile(
      path.join(project1, ".kilocode/rules/api.md"),
      "# API Rules"
    );
    
    const projects: ProjectInfo[] = [
      { name: "project1", path: project1 },
      { name: "project2", path: project2 },
      { name: "project3", path: project3 },
    ];
    
    const options: MultiSyncOptions = {
      rulePatterns: ["**/*.md"],
      excludePatterns: [],
      dryRun: true,
      autoConfirm: true,
    };
    
    // Scan projects
    const fileStates = await scanAllProjects(projects, options);
    
    // Simulate files being created in other projects after scan
    await fs.writeFile(
      path.join(project2, ".kilocode/rules/config.md"),
      "# Local Config"
    );
    await fs.writeFile(
      path.join(project3, ".kilocode/rules/api.md"),
      "# Local API"
    );
    
    // Clear previous warnings
    logWarnSpy.mockClear();
    
    // Get confirmations
    const actions = await getUserConfirmations(fileStates, options, projects);
    
    const warnings = logWarnSpy.mock.calls.map(call => call[0]);
    console.log("Multiple overwrites warnings:", warnings);
    
    // Should have overwrite warnings
    expect(warnings.some(w => w.includes("WARNING: Auto-confirm will OVERWRITE"))).toBe(true);
    expect(warnings.some(w => w.includes("config.md in project2 (file already exists!)"))).toBe(true);
    expect(warnings.some(w => w.includes("api.md in project3 (file already exists!)"))).toBe(true);
    expect(warnings.some(w => w.includes("STRONGLY RECOMMENDED"))).toBe(true);
    
    // Should still have the regular addition warnings
    expect(warnings.some(w => w.includes("Auto-confirm will add the following files"))).toBe(true);
  });
});