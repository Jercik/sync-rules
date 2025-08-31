import { describe, it, expect } from "vitest";
import {
  SyncError,
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
} from "../src/utils/errors.ts";

describe("SyncError class", () => {
  it("should create a SyncError with message", () => {
    const error = new SyncError("Test error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("SyncError");
  });

  it("should have details property", () => {
    const error = new SyncError("Test error", {
      adapter: "claude",
      project: "/test/project",
    });

    expect(error.details).toEqual({
      adapter: "claude",
      project: "/test/project",
    });
  });

  it("should have empty details by default", () => {
    const error = new SyncError("Test error");
    expect(error.details).toEqual({});
  });

  it("should maintain proper stack trace", () => {
    const error = new SyncError("Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("Test error");
  });

  it("should support various detail combinations", () => {
    const adapterError = new SyncError("Adapter failed", {
      adapter: "gemini",
      project: "/path",
    });

    const executionError = new SyncError("Write failed", {
      action: "write",
      path: "/file.txt",
    });

    expect(adapterError.details.adapter).toBe("gemini");
    expect(adapterError.details.project).toBe("/path");

    expect(executionError.details.action).toBe("write");
    expect(executionError.details.path).toBe("/file.txt");
  });
});

describe("ConfigNotFoundError", () => {
  it("should create error for missing config", () => {
    const error = new ConfigNotFoundError("/path/to/config.json");
    expect(error.name).toBe("ConfigNotFoundError");
    expect(error.path).toBe("/path/to/config.json");
    expect(error.isDefault).toBe(false);
    expect(error.message).toBe("Config file not found at /path/to/config.json");
  });

  it("should handle default config message", () => {
    const error = new ConfigNotFoundError("/default/config.json", true);
    expect(error.isDefault).toBe(true);
    expect(error.message).toBe(
      "Default config file not found at /default/config.json",
    );
  });
});

describe("ConfigParseError", () => {
  it("should create error for parse failures", () => {
    const error = new ConfigParseError("/path/to/config.json");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ConfigParseError");
    expect(error.path).toBe("/path/to/config.json");
    expect(error.message).toBe(
      "Failed to parse config from /path/to/config.json",
    );
  });

  it("should include original error message", () => {
    const originalError = new Error("Invalid JSON");
    const error = new ConfigParseError("/path/to/config.json", originalError);
    expect(error.originalError).toBe(originalError);
    expect(error.message).toBe(
      "Failed to load config from /path/to/config.json: Invalid JSON",
    );
  });
});

describe("SpawnError", () => {
  it("should create error for command not found", () => {
    const error = new SpawnError("nonexistent", "ENOENT", 1);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SpawnError");
    expect(error.command).toBe("nonexistent");
    expect(error.code).toBe("ENOENT");
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(
      '"nonexistent" not found on PATH. Install it or adjust your alias.',
    );
  });

  it("should use custom message when provided", () => {
    const error = new SpawnError("cmd", "ERROR", 42, "Custom failure");
    expect(error.message).toBe("Custom failure");
  });

  it("should use default message when not ENOENT", () => {
    const error = new SpawnError("cmd", "ERROR", 1);
    expect(error.message).toBe('Failed to launch "cmd"');
  });
});
