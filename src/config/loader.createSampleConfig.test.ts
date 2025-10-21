import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe("createSampleConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSampleConfig uses atomic 'wx' when force=false", async () => {
    const fs = await import("node:fs/promises");
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await createSampleConfig("/tmp/config.json", false);

    expect(fs.mkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/config.json",
      expect.stringContaining('"projects"'),
      { encoding: "utf8", flag: "wx" },
    );
  });

  it("createSampleConfig overwrites file when force=true", async () => {
    const fs = await import("node:fs/promises");
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await createSampleConfig("/tmp/config.json", true);

    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/config.json",
      expect.any(String),
      { encoding: "utf8", flag: "w" },
    );
  });

  it("atomic create: EEXIST yields actionable 'use --force' hint", async () => {
    const fs = await import("node:fs/promises");
    const { createSampleConfig } = await import("./loader.js");
    const eexist = Object.assign(new Error("exists"), { code: "EEXIST" });
    vi.mocked(fs.writeFile).mockRejectedValue(eexist);

    const error = await createSampleConfig("/tmp/config.json", false).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toMatch(/already exists.*--force/iu);
      expect(error.cause).toBe(eexist);
    }
  });

  it("non-EEXIST errors are wrapped with normalized path context", async () => {
    const fs = await import("node:fs/promises");
    const { createSampleConfig } = await import("./loader.js");
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    vi.mocked(fs.writeFile).mockRejectedValue(eacces);

    const error = await createSampleConfig("/tmp/config.json", true).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toMatch(
        /Failed to create config file at \/tmp\/config\.json: EACCES/u,
      );
      expect(error.cause).toBe(eacces);
    }
  });
});
