import { describe, it, expect } from "vitest";
import {
  SyncError,
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
  ensureError,
} from "./errors.js";

describe("syncError class", () => {
  it("syncError sets name/message and optionally stores details and cause", () => {
    const cases = [
      {
        title: "basic error with message only",
        message: "Test error",
        details: undefined,
        cause: undefined,
        expectedDetails: {},
      },
      {
        title: "error with adapter/project details",
        message: "Adapter failed",
        details: { adapter: "claude", project: "/test/project" },
        cause: undefined,
        expectedDetails: { adapter: "claude", project: "/test/project" },
      },
      {
        title: "error with action/path details",
        message: "Write failed",
        details: { action: "write", path: "/file.txt" },
        cause: undefined,
        expectedDetails: { action: "write", path: "/file.txt" },
      },
      {
        title: "error with cause",
        message: "Wrapped error",
        details: undefined,
        cause: new Error("Original cause"),
        expectedDetails: {},
      },
    ];

    for (const c of cases) {
      const error = new SyncError(c.message, c.details, c.cause);
      expect(error).toBeInstanceOf(SyncError);
      expect(error.name).toBe("SyncError");
      expect(error.message).toBe(c.message);
      expect(error.details).toStrictEqual(c.expectedDetails);
      expect(error.cause).toBe(c.cause);
    }
  });
});

describe("configNotFoundError", () => {
  const cases = [
    {
      title: "missing non-default config",
      path: "/path/to/config.json",
      isDefault: false,
      message: "Config file not found at /path/to/config.json",
      hintContains: "--init --config <path>",
    },
    {
      title: "missing default config",
      path: "/default/config.json",
      isDefault: true,
      message: "Default config file not found at /default/config.json",
      hintContains: "Run 'sync-rules --init'",
    },
  ] as const;

  it.each(cases)("should create error for $title", (c) => {
    const error = new ConfigNotFoundError(c.path, c.isDefault);
    expect({ name: error.name, path: error.path, isDefault: error.isDefault }).toStrictEqual({
      name: "ConfigNotFoundError",
      path: c.path,
      isDefault: c.isDefault,
    });
    expect(error.message).toContain(c.message);
    expect(error.message).toContain("Try 'sync-rules --help' for details.");
    expect(error.message).toContain(c.hintContains);
  });
});

describe("configParseError", () => {
  const cases = [
    {
      title: "parse failure without original error",
      path: "/path/to/config.json",
      original: undefined,
      expectedMessage: "Failed to parse config from /path/to/config.json",
    },
    {
      title: "parse failure with original error",
      path: "/path/to/config.json",
      original: new Error("Invalid JSON"),
      expectedMessage: "Failed to load config from /path/to/config.json: Invalid JSON",
    },
  ] as const;

  it.each(cases)("should create error for $title", (c) => {
    const error = new ConfigParseError(c.path, c.original);
    expect(error).toBeInstanceOf(Error);
    expect({
      name: error.name,
      path: error.path,
      originalError: error.originalError,
    }).toStrictEqual({
      name: "ConfigParseError",
      path: c.path,
      originalError: c.original,
    });
    expect(error.message).toContain(c.expectedMessage);
    expect(error.message).toContain("Fix the JSON and glob patterns");
    expect(error.message).toContain("Try 'sync-rules --help' for schema and examples.");
  });
});

describe("spawnError", () => {
  const cases = [
    {
      title: "command not found (ENOENT)",
      input: {
        command: "nonexistent",
        code: "ENOENT",
        exitCode: undefined,
        signal: undefined,
      },
      expectedMessage:
        '"nonexistent" not found on PATH or cwd invalid. Install it or verify working directory.',
    },
    {
      title: "default message when not ENOENT",
      input: {
        command: "cmd",
        code: undefined,
        exitCode: undefined,
        signal: undefined,
      },
      expectedMessage: 'Failed to launch "cmd"',
    },
    {
      title: "tool exited with non-zero code",
      input: {
        command: "test",
        code: undefined,
        exitCode: 42,
        signal: undefined,
      },
      expectedMessage: "Tool 'test' exited with code 42",
    },
    {
      title: "process killed with signal",
      input: {
        command: "killed",
        code: undefined,
        exitCode: undefined,
        signal: "SIGTERM",
      },
      expectedMessage: 'Process "killed" killed by signal SIGTERM',
    },
  ] as const;

  it.each(cases)("should create error: $title", (c) => {
    const error = new SpawnError(c.input.command, c.input.code, c.input.exitCode, c.input.signal);
    expect(error).toBeInstanceOf(Error);
    expect({
      name: error.name,
      command: error.command,
      code: error.code,
      exitCode: error.exitCode,
      signal: error.signal,
      message: error.message,
    }).toStrictEqual({
      name: "SpawnError",
      command: c.input.command,
      code: c.input.code,
      exitCode: c.input.exitCode,
      signal: c.input.signal,
      message: c.expectedMessage,
    });
  });

  it("preserves cause on SpawnError for error chaining", () => {
    const cause = new Error("Original error");
    const error = new SpawnError("cmd", undefined, 1, undefined, cause);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe("Tool 'cmd' exited with code 1");
  });

  // buildMessage static method testing removed - constructor tests already cover message branches
});

describe("ensureError / isNodeError extras", () => {
  it("ensureError wraps non-Error values", () => {
    const error = ensureError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
  });
});
