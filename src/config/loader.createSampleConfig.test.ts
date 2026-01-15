import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import { createConfigStore } from "./constants.js";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));
vi.mock("./constants.js", async () => {
  const actual =
    await vi.importActual<typeof import("./constants.js")>("./constants.js");
  return {
    ...actual,
    createConfigStore: vi.fn(),
  };
});

describe("createSampleConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSampleConfig writes a sample config when file is missing", async () => {
    const { createSampleConfig } = await import("./loader.js");
    const store = {
      path: "/tmp/config.json",
      store: {} as Record<string, unknown>,
    };
    vi.mocked(createConfigStore).mockReturnValue(store as never);
    const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(fs.stat).mockRejectedValue(missing);

    await createSampleConfig("/tmp/config.json", false);

    expect(store.store).toEqual({
      global: ["global-rules/*.md"],
      projects: [
        {
          path: "/path/to/project",
          rules: ["**/*.md"],
        },
      ],
    });
  });

  it("createSampleConfig overwrites file when force=true", async () => {
    const { createSampleConfig } = await import("./loader.js");
    const store = {
      path: "/tmp/config.json",
      store: {} as Record<string, unknown>,
    };
    vi.mocked(createConfigStore).mockReturnValue(store as never);

    await createSampleConfig("/tmp/config.json", true);

    expect(fs.stat).not.toHaveBeenCalled();
    expect(store.store).toEqual({
      global: ["global-rules/*.md"],
      projects: [
        {
          path: "/path/to/project",
          rules: ["**/*.md"],
        },
      ],
    });
  });

  it("atomic create: EEXIST yields actionable 'use --force' hint", async () => {
    const { createSampleConfig } = await import("./loader.js");
    const store = {
      path: "/tmp/config.json",
      store: {} as Record<string, unknown>,
    };
    vi.mocked(createConfigStore).mockReturnValue(store as never);
    vi.mocked(fs.stat).mockResolvedValue({
      isFile: () => true,
    } as never);

    const error = await createSampleConfig("/tmp/config.json", false).catch(
      (error_: unknown) => error_,
    );

    expect(error).toBeInstanceOf(Error);
    const error_ = error as Error;
    expect(error_.message).toMatch(/already exists.*--force/iu);
  });

  it("non-EEXIST errors are wrapped with normalized path context", async () => {
    const { createSampleConfig } = await import("./loader.js");
    const store = {
      path: "/tmp/config.json",
      store: {} as Record<string, unknown>,
    };
    vi.mocked(createConfigStore).mockReturnValue(store as never);
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    vi.mocked(fs.stat).mockRejectedValue(eacces);

    const error = await createSampleConfig("/tmp/config.json", false).catch(
      (error_: unknown) => error_,
    );

    expect(error).toBeInstanceOf(Error);
    const error_ = error as Error;
    expect(error_.message).toMatch(
      /Failed to create config file at \/tmp\/config\.json: EACCES/u,
    );
    expect(error_.cause).toBe(eacces);
  });
});
