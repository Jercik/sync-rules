import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import {
  log,
  error,
  debug,
  getFileHash,
  setVerbose,
  normalizePath,
} from "../../../src/utils/core.ts";
import { createTestProject } from "../../helpers/setup.ts";
import { createFile } from "../../helpers/fs-utils.ts";

describe("log", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should log messages", () => {
    log("Test message");
    expect(consoleSpy).toHaveBeenCalledWith("Test message");
  });
});

describe("error", () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should log error messages", () => {
    error("Error message");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error message");
  });
});

describe("debug", () => {
  let consoleDebugSpy: any;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("should log debug messages when verbose is true", () => {
    setVerbose(true);
    debug("Debug message");
    expect(consoleDebugSpy).toHaveBeenCalledWith("[DEBUG]", "Debug message");
    setVerbose(false); // Reset for other tests
  });

  it("should not log debug messages when verbose is false", () => {
    setVerbose(false);
    debug("Debug message");
    expect(consoleDebugSpy).not.toHaveBeenCalled();
  });
});

describe("getFileHash", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await createTestProject("hash-test", {});
  });

  it("should calculate SHA-256 hash of file", async () => {
    const filePath = path.join(projectPath, "test.txt");
    await createFile(filePath, "Hello, world!");

    const hash = await getFileHash(filePath);

    expect(hash).toBe("315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3");
  });

  it("should return consistent hash for same content", async () => {
    const file1 = path.join(projectPath, "file1.txt");
    const file2 = path.join(projectPath, "file2.txt");
    const content = "Consistent content";

    await createFile(file1, content);
    await createFile(file2, content);

    const hash1 = await getFileHash(file1);
    const hash2 = await getFileHash(file2);

    expect(hash1).toBe(hash2);
  });

  it("should handle empty files", async () => {
    const filePath = path.join(projectPath, "empty.txt");
    await createFile(filePath, "");

    const hash = await getFileHash(filePath);

    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("should handle binary files", async () => {
    const filePath = path.join(projectPath, "binary.bin");
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await createFile(filePath, buffer);

    const hash = await getFileHash(filePath);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should throw error for non-existent file", async () => {
    const nonExistentPath = path.join(projectPath, "nonexistent.txt");

    await expect(getFileHash(nonExistentPath)).rejects.toThrow(
      "File not found",
    );
  });

  it("should throw error when trying to hash a directory", async () => {
    const dirPath = path.join(projectPath, "a-directory");
    await import("fs/promises").then((fs) => fs.mkdir(dirPath));

    await expect(getFileHash(dirPath)).rejects.toThrow(
      "Path is not a regular file",
    );
  });
});

describe("normalizePath", () => {
  it("should correctly resolve a malicious path", () => {
    const maliciousPath = "a/b/../../../etc/passwd";
    const normalized = normalizePath(path.join("/safe/path", maliciousPath));
    const expected = path.resolve("/safe/path", maliciousPath);
    expect(normalized).toBe(expected.replace(/\\/g, "/"));
  });
});
