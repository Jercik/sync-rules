import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe("createSampleConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a sample config with exclusive create by default", async () => {
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.mkdir).mockResolvedValue(void 0);
    vi.mocked(fs.writeFile).mockResolvedValue(void 0);

    await createSampleConfig("/tmp/config.json", false);

    expect(fs.mkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/config.json",
      expect.any(String),
      { flag: "wx" },
    );
    const content = vi.mocked(fs.writeFile).mock.calls[0]?.[1] as string;
    expect(content).toContain('"rulesSource"');
    expect(content).toContain('"global-rules/*.md"');
    expect(content).toContain('"projects"');
  });

  it("overwrites file when force=true", async () => {
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.mkdir).mockResolvedValue(void 0);
    vi.mocked(fs.writeFile).mockResolvedValue(void 0);

    await createSampleConfig("/tmp/config.json", true);

    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/config.json",
      expect.any(String),
      { flag: "w" },
    );
  });

  it("atomic create: EEXIST yields actionable 'use --force' hint", async () => {
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.mkdir).mockResolvedValue(void 0);
    const eexist = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    vi.mocked(fs.writeFile).mockRejectedValue(eexist);

    const error = await createSampleConfig("/tmp/config.json", false).catch(
      (error_: unknown) => error_,
    );

    expect(error).toBeInstanceOf(Error);
    const error_ = error as Error;
    expect(error_.message).toMatch(/already exists.*--force/iu);
    expect(error_.cause).toBe(eexist);
  });

  it("non-EEXIST errors are wrapped with normalized path context", async () => {
    const { createSampleConfig } = await import("./loader.js");
    vi.mocked(fs.mkdir).mockResolvedValue(void 0);
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    vi.mocked(fs.writeFile).mockRejectedValue(eacces);

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
