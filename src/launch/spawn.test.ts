import { describe, it, expect, vi } from "vitest";
import { execa, ExecaError } from "execa";
import { spawnProcess } from "./spawn.js";
import { SpawnError } from "../utils/errors.js";

vi.mock("execa");

describe("spawnProcess", () => {
  it("should throw SpawnError for non-zero exit code", async () => {
    const execaError = Object.assign(
      new Error("Command failed with exit code 1"),
      {
        name: "ExecaError",
        exitCode: 1,
        stdout: "",
        stderr: "",
      },
    ) as ExecaError;
    vi.mocked(execa).mockRejectedValue(execaError);

    await expect(spawnProcess("false", [])).rejects.toThrow(SpawnError);
  });

  it("converts signal kill into SpawnError (signal included)", async () => {
    const error = Object.assign(new Error("Process killed"), {
      name: "ExecaError",
      exitCode: undefined,
      signal: "SIGTERM",
    }) as ExecaError;
    vi.mocked(execa).mockRejectedValue(error);

    await expect(spawnProcess("test", [])).rejects.toThrow(SpawnError);
  });

  it("should throw SpawnError when command not found", async () => {
    const execaError = Object.assign(new Error("spawn ENOENT"), {
      name: "ExecaError",
      code: "ENOENT",
      exitCode: undefined,
    });
    vi.mocked(execa).mockRejectedValue(execaError);

    await expect(spawnProcess("nonexistent", [])).rejects.toThrow(SpawnError);
  });
});
