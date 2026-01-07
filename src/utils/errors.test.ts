import { describe, it, expect } from "vitest";
import {
  SyncError,
  ConfigNotFoundError,
  ConfigParseError,
  SpawnError,
  ensureError,
} from "./errors.js";

describe("SyncError class", () => {
  it("SyncError sets name/message and optionally stores details and cause", () => {
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
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SyncError);
      expect(error.name).toBe("SyncError");
      expect(error.message).toBe(c.message);
      expect(error.details).toEqual(c.expectedDetails);
      expect(error.cause).toBe(c.cause);
    }
  });
});

describe("ConfigNotFoundError", () => {
  const cases = [
    {
      title: "missing non-default config",
      path: "/path/to/config.json",
      isDefault: false,
      message: "Config file not found at /path/to/config.json",
      hintContains: "init --config <path>",
    },
    {
      title: "missing default config",
      path: "/default/config.json",
      isDefault: true,
      message: "Default config file not found at /default/config.json",
      hintContains: "Run 'sync-rules init'",
    },
  ] as const;

  for (const c of cases) {
    it(`should create error for ${c.title}`, () => {
      const error = new ConfigNotFoundError(c.path, c.isDefault);
      expect(error.name).toBe("ConfigNotFoundError");
      expect(error.path).toBe(c.path);
      expect(error.isDefault).toBe(c.isDefault);
      expect(error.message).toContain(c.message);
      expect(error.message).toContain("Try 'sync-rules --help' for details.");
      expect(error.message).toContain(c.hintContains);
    });
  }
});

describe("ConfigParseError", () => {
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
      expectedMessage:
        "Failed to load config from /path/to/config.json: Invalid JSON",
    },
  ] as const;

  for (const c of cases) {
    it(`should create error for ${c.title}`, () => {
      const error = new ConfigParseError(c.path, c.original);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ConfigParseError");
      expect(error.path).toBe(c.path);
      expect(error.originalError).toBe(c.original);
      expect(error.message).toContain(c.expectedMessage);
      expect(error.message).toContain("Fix the JSON and glob patterns");
      expect(error.message).toContain(
        "Try 'sync-rules --help' for schema and examples.",
      );
    });
  }
});

describe("SpawnError", () => {
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

  for (const c of cases) {
    it(`should create error: ${c.title}`, () => {
      const error = new SpawnError(
        c.input.command,
        c.input.code,
        c.input.exitCode,
        c.input.signal,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("SpawnError");
      expect(error.command).toBe(c.input.command);
      expect(error.code).toBe(c.input.code);
      expect(error.exitCode).toBe(c.input.exitCode);
      expect(error.signal).toBe(c.input.signal);
      expect(error.message).toBe(c.expectedMessage);
    });
  }

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
