import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "path";
import { promises as fs } from "node:fs";
import {
  scanAllProjects,
  getUserConfirmations,
  type GlobalFileState,
  type MultiSyncOptions,
  type FileVersion,
} from "../../src/multi-sync.ts";
import { type ProjectInfo } from "../../src/discovery.ts";
import { createTestProject } from "../helpers/setup.ts";
import { createFile } from "../helpers/fs-utils.ts";

// Mock the utilities
vi.mock("../../src/utils/core.ts", () => ({
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../src/utils/prompts.ts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../src/utils/formatters.ts", () => ({
  formatTime: vi.fn((date: Date) => date.toISOString()),
}));
vi.mock("../../src/scan.ts", () => ({
  scan: vi.fn(),
}));

describe("scanAllProjects", () => {
  let tempDir: string;
  let projects: ProjectInfo[];
  let options: MultiSyncOptions;

  beforeEach(async () => {
    tempDir = await createTestProject("multi-sync-test", {});

    // Create test projects
    const project1Path = path.join(tempDir, "project1");
    const project2Path = path.join(tempDir, "project2");

    await fs.mkdir(project1Path, { recursive: true });
    await fs.mkdir(project2Path, { recursive: true });

    projects = [
      { name: "project1", path: project1Path },
      { name: "project2", path: project2Path },
    ];

    options = {
      rulePatterns: [".clinerules.md", ".cursorrules.md"],
      excludePatterns: ["node_modules"],
      dryRun: false,
    };
  });

  it("should scan all projects and build global file state", async () => {
    // Mock the scan function
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create test files
    const file1Path = path.join(projects[0].path, ".clinerules.md");
    const file2Path = path.join(projects[1].path, ".clinerules.md");

    await createFile(file1Path, "rule content 1");
    await createFile(file2Path, "rule content 2");

    // Mock scan results - now scan returns a Map directly
    mockScan.mockImplementation(async (options) => {
      const files = new Map();

      if (options.projectDir === projects[0].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file1Path,
          hash: "hash1",
          isLocal: false,
        });
      } else if (options.projectDir === projects[1].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file2Path,
          hash: "hash2",
          isLocal: false,
        });
      }

      return files;
    });

    const globalFileStates = await scanAllProjects(projects, options);

    expect(globalFileStates.size).toBe(1);
    expect(globalFileStates.has(".clinerules.md")).toBe(true);

    const fileState = globalFileStates.get(".clinerules.md")!;
    expect(fileState.versions.size).toBe(2);
    expect(fileState.versions.has("project1")).toBe(true);
    expect(fileState.versions.has("project2")).toBe(true);
    expect(fileState.missingFrom).toHaveLength(0);
  });

  it("should handle missing files across projects", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create file only in project1
    const file1Path = path.join(projects[0].path, ".clinerules.md");
    await createFile(file1Path, "rule content");

    mockScan.mockImplementation(async (options) => {
      const files = new Map();

      if (options.projectDir === projects[0].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file1Path,
          hash: "hash1",
          isLocal: false,
        });
      }

      return files;
    });

    const globalFileStates = await scanAllProjects(projects, options);

    expect(globalFileStates.size).toBe(1);

    const fileState = globalFileStates.get(".clinerules.md")!;
    expect(fileState.versions.size).toBe(1);
    expect(fileState.versions.has("project1")).toBe(true);
    expect(fileState.missingFrom).toEqual(["project2"]);
  });

  it("should skip local files", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create local file
    const localFilePath = path.join(projects[0].path, "config.local.js");
    await createFile(localFilePath, "local config");

    mockScan.mockImplementation(async (options) => {
      const files = new Map();

      if (options.projectDir === projects[0].path) {
        files.set("config.local.js", {
          relativePath: "config.local.js",
          absolutePath: localFilePath,
          hash: "hash1",
          isLocal: true,
        });
      }

      return files;
    });

    const globalFileStates = await scanAllProjects(projects, options);

    expect(globalFileStates.size).toBe(0);
  });

  it("should determine newest version correctly", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create files with different modification times
    const file1Path = path.join(projects[0].path, ".clinerules.md");
    const file2Path = path.join(projects[1].path, ".clinerules.md");

    await createFile(file1Path, "rule content 1");
    await createFile(file2Path, "rule content 2");

    // Set different modification times
    const olderTime = new Date("2024-01-01T00:00:00Z");
    const newerTime = new Date("2024-01-02T00:00:00Z");

    await fs.utimes(file1Path, olderTime, olderTime);
    await fs.utimes(file2Path, newerTime, newerTime);

    mockScan.mockImplementation(async (options) => {
      const files = new Map();

      if (options.projectDir === projects[0].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file1Path,
          hash: "hash1",
          isLocal: false,
        });
      } else if (options.projectDir === projects[1].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file2Path,
          hash: "hash2",
          isLocal: false,
        });
      }

      return files;
    });

    const globalFileStates = await scanAllProjects(projects, options);

    const fileState = globalFileStates.get(".clinerules.md")!;
    expect(fileState.newestVersion?.projectName).toBe("project2");
  });

  it("should detect identical files", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create identical files
    const file1Path = path.join(projects[0].path, ".clinerules.md");
    const file2Path = path.join(projects[1].path, ".clinerules.md");

    await createFile(file1Path, "same content");
    await createFile(file2Path, "same content");

    mockScan.mockImplementation(async (options) => {
      const files = new Map();

      if (options.projectDir === projects[0].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file1Path,
          hash: "samehash",
          isLocal: false,
        });
      } else if (options.projectDir === projects[1].path) {
        files.set(".clinerules.md", {
          relativePath: ".clinerules.md",
          absolutePath: file2Path,
          hash: "samehash",
          isLocal: false,
        });
      }

      return files;
    });

    const globalFileStates = await scanAllProjects(projects, options);

    const fileState = globalFileStates.get(".clinerules.md")!;
    expect(fileState.allIdentical).toBe(true);
  });

  it("should handle scan failures gracefully", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Create the actual file for project2 so stat() can work
    const file2Path = path.join(projects[1].path, ".clinerules.md");
    await createFile(file2Path, "rule content 2");

    // Make first project fail, second succeed
    mockScan.mockImplementation(async (options) => {
      if (options.projectDir === projects[0].path) {
        throw new Error("Scan failed");
      }

      return new Map([
        [
          ".clinerules.md",
          {
            relativePath: ".clinerules.md",
            absolutePath: file2Path,
            hash: "hash2",
            isLocal: false,
          },
        ],
      ]);
    });

    const globalFileStates = await scanAllProjects(projects, options);

    expect(globalFileStates.size).toBe(1);
    const fileState = globalFileStates.get(".clinerules.md")!;
    expect(fileState.versions.size).toBe(1);
    expect(fileState.versions.has("project2")).toBe(true);
    expect(fileState.missingFrom).toEqual(["project1"]);
  });

  it("should throw error if no projects can be scanned", async () => {
    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);

    // Make all projects fail
    mockScan.mockRejectedValue(new Error("All scans failed"));

    await expect(scanAllProjects(projects, options)).rejects.toThrow(
      "No projects could be successfully scanned",
    );
  });
});

describe("getUserConfirmations", () => {
  let fileStates: Map<string, GlobalFileState>;
  let options: MultiSyncOptions;
  let projects: ProjectInfo[];

  beforeEach(() => {
    options = {
      rulePatterns: [".clinerules.md"],
      excludePatterns: [],
      dryRun: false,
    };

    fileStates = new Map();
    
    // Mock projects array
    projects = [
      { name: "project1", path: "/path/to/project1" },
      { name: "project2", path: "/path/to/project2" },
      { name: "project3", path: "/path/to/project3" },
    ];
  });

  it("should return auto-confirmed actions for dry run", async () => {
    options.dryRun = true;

    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "hash1",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: ["project2"],
      newestVersion: {
        projectName: "project1",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project1/.clinerules.md",
          hash: "hash1",
        },
        lastModified: new Date("2024-01-01T00:00:00Z"),
      },
      allIdentical: false,
    };

    fileStates.set(".clinerules.md", fileState);

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("add");
    expect(actions[0].targetProject).toBe("project2");
    expect(actions[0].sourceProject).toBe("project1");
  });

  it("should return auto-confirmed actions for autoConfirm option", async () => {
    options.autoConfirm = true;

    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "hash1",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: ["project2"],
      newestVersion: {
        projectName: "project1",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project1/.clinerules.md",
          hash: "hash1",
        },
        lastModified: new Date("2024-01-01T00:00:00Z"),
      },
      allIdentical: false,
    };

    fileStates.set(".clinerules.md", fileState);

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("add");
    expect(actions[0].targetProject).toBe("project2");
    expect(actions[0].sourceProject).toBe("project1");
  });

  it("should skip identical files", async () => {
    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "samehash",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
        [
          "project2",
          {
            projectName: "project2",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project2/.clinerules.md",
              hash: "samehash",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: [],
      newestVersion: {
        projectName: "project1",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project1/.clinerules.md",
          hash: "samehash",
        },
        lastModified: new Date("2024-01-01T00:00:00Z"),
      },
      allIdentical: true,
    };

    fileStates.set(".clinerules.md", fileState);

    const actions = await getUserConfirmations(fileStates, null, options, projects);
    expect(actions).toHaveLength(0);
  });

  it("should prompt user to delete files missing from some projects", async () => {
    const { select } = await import("../../src/utils/prompts.ts");
    const mockSelect = vi.mocked(select);

    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "hash1",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: ["project2", "project3"],
      newestVersion: {
        projectName: "project1",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project1/.clinerules.md",
          hash: "hash1",
        },
        lastModified: new Date("2024-01-01T00:00:00Z"),
      },
      allIdentical: false,
    };

    fileStates.set(".clinerules.md", fileState);

    // Mock user selecting delete-all
    mockSelect.mockResolvedValueOnce("delete-all");

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("exists only in project1"),
      expect.arrayContaining([
        expect.objectContaining({ value: "copy" }),
        expect.objectContaining({ value: "delete-all" }),
        expect.objectContaining({ value: "skip" }),
      ]),
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("delete");
    expect(actions[0].targetProject).toBe("project1");
  });

  it("should never delete files in auto-confirm mode", async () => {
    options.autoConfirm = true;

    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "hash1",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: ["project2"],
      newestVersion: {
        projectName: "project1",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project1/.clinerules.md",
          hash: "hash1",
        },
        lastModified: new Date("2024-01-01T00:00:00Z"),
      },
      allIdentical: false,
    };

    fileStates.set(".clinerules.md", fileState);

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    // Should add to missing project, not delete
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("add");
    expect(actions[0].targetProject).toBe("project2");
    expect(actions[0].sourceProject).toBe("project1");
  });

  it("should handle user choosing specific project version", async () => {
    const { select } = await import("../../src/utils/prompts.ts");
    const mockSelect = vi.mocked(select);

    const fileState: GlobalFileState = {
      relativePath: ".clinerules.md",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project1/.clinerules.md",
              hash: "hash1",
            },
            lastModified: new Date("2024-01-01T00:00:00Z"),
          },
        ],
        [
          "project2",
          {
            projectName: "project2",
            fileInfo: {
              relativePath: ".clinerules.md",
              absolutePath: "/path/to/project2/.clinerules.md",
              hash: "hash2",
            },
            lastModified: new Date("2024-01-02T00:00:00Z"),
          },
        ],
      ]),
      missingFrom: [],
      newestVersion: {
        projectName: "project2",
        fileInfo: {
          relativePath: ".clinerules.md",
          absolutePath: "/path/to/project2/.clinerules.md",
          hash: "hash2",
        },
        lastModified: new Date("2024-01-02T00:00:00Z"),
      },
      allIdentical: false,
    };

    fileStates.set(".clinerules.md", fileState);
    // Mock user selecting project1's version (which should be group-1 since project2 is newer)
    mockSelect.mockResolvedValueOnce("use-group-1");

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("update");
    expect(actions[0].targetProject).toBe("project2");
    expect(actions[0].sourceProject).toBe("project1");
  });

  it("should handle a single project without errors", async () => {
    const tempDir = await createTestProject("single-project-test", {});
    const project1Path = path.join(tempDir, "project1");
    await fs.mkdir(project1Path, { recursive: true });
    const singleProject = [{ name: "project1", path: project1Path }];

    const { scan } = await import("../../src/scan.ts");
    const mockScan = vi.mocked(scan);
    mockScan.mockResolvedValue(new Map());

    const globalFileStates = await scanAllProjects(singleProject, options);
    expect(globalFileStates.size).toBe(0);
  });
  it("should handle mixed identical and different files", async () => {
    const { select } = await import("../../src/utils/prompts.ts");
    const mockSelect = vi.mocked(select);

    const identicalFileState: GlobalFileState = {
      relativePath: "identical.rule",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: { hash: "same" },
            lastModified: new Date(),
          } as FileVersion,
        ],
        [
          "project2",
          {
            projectName: "project2",
            fileInfo: { hash: "same" },
            lastModified: new Date(),
          } as FileVersion,
        ],
      ]),
      missingFrom: [],
      allIdentical: true,
      newestVersion: {
        projectName: "project1",
        fileInfo: { hash: "same" },
        lastModified: new Date(),
      } as FileVersion,
    };

    const differentFileState: GlobalFileState = {
      relativePath: "different.rule",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: { hash: "diff1" },
            lastModified: new Date(),
          } as FileVersion,
        ],
        [
          "project2",
          {
            projectName: "project2",
            fileInfo: { hash: "diff2" },
            lastModified: new Date(),
          } as FileVersion,
        ],
      ]),
      missingFrom: [],
      allIdentical: false,
      newestVersion: {
        projectName: "project1",
        lastModified: new Date(),
        fileInfo: { hash: "diff1" },
      } as FileVersion,
    };

    fileStates.set("identical.rule", identicalFileState);
    fileStates.set("different.rule", differentFileState);

    // Mock selecting the first version (use-group-0)
    mockSelect.mockResolvedValueOnce("use-group-0");

    const actions = await getUserConfirmations(fileStates, null, options, projects);
    expect(actions.length).toBe(1); // Only one action for the different file
    expect(actions[0].relativePath).toBe("different.rule");
  });

  it("should correctly generate delete actions when user confirms", async () => {
    const { select } = await import("../../src/utils/prompts.ts");
    const mockSelect = vi.mocked(select);
    mockSelect.mockResolvedValue("delete-all");

    const fileState: GlobalFileState = {
      relativePath: "delete-me.rule",
      versions: new Map([
        [
          "project1",
          {
            projectName: "project1",
            fileInfo: { absolutePath: "/path/p1/delete-me.rule" },
            lastModified: new Date(),
          } as FileVersion,
        ],
        [
          "project2",
          {
            projectName: "project2",
            fileInfo: { absolutePath: "/path/p2/delete-me.rule" },
            lastModified: new Date(),
          } as FileVersion,
        ],
      ]),
      missingFrom: [],
      allIdentical: false,
      newestVersion: {
        projectName: "project1",
        lastModified: new Date(),
        fileInfo: { absolutePath: "/path/p1/delete-me.rule" },
      } as FileVersion,
    };
    fileStates.set("delete-me.rule", fileState);

    const actions = await getUserConfirmations(fileStates, null, options, projects);

    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("delete");
    expect(actions[1].type).toBe("delete");
    expect(actions.map((a) => a.targetProject).sort()).toEqual([
      "project1",
      "project2",
    ]);
  });
});
