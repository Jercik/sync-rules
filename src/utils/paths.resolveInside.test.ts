import { describe, it, expect } from "vitest";
import { resolveInside } from "./paths.js";
import path from "node:path";

describe("resolveInside", () => {
  const baseDirectory = "/home/project";

  it("resolves relative path inside base directory", () => {
    const result = resolveInside(baseDirectory, "subdir/file.md");
    expect(result).toBe(path.join(baseDirectory, "subdir/file.md"));
  });

  it("rejects path traversal attempts with ../ segments", () => {
    expect(() => resolveInside(baseDirectory, "../../etc/passwd")).toThrow(
      /Refusing to write outside/u,
    );
  });

  it("rejects absolute paths outside base directory", () => {
    expect(() => resolveInside(baseDirectory, "/etc/passwd")).toThrow(
      /Refusing to write outside/u,
    );
  });

  it("accepts paths with ./ segments", () => {
    const result = resolveInside(baseDirectory, "./subdir/./file.md");
    expect(result).toBe(path.join(baseDirectory, "subdir/file.md"));
  });

  it("rejects complex traversal attempts", () => {
    expect(() =>
      resolveInside(baseDirectory, "valid/../../../etc/passwd"),
    ).toThrow(/Refusing to write outside/u);
  });
});
