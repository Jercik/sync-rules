import { describe, it, expect } from "vitest";
import { resolveInside } from "./paths.js";
import { join } from "node:path";

describe("resolveInside", () => {
  const baseDir = "/home/project";

  it("resolves relative path inside base directory", () => {
    const result = resolveInside(baseDir, "subdir/file.md");
    expect(result).toBe(join(baseDir, "subdir/file.md"));
  });

  it("rejects path traversal attempts with ../ segments", () => {
    expect(() => resolveInside(baseDir, "../../etc/passwd")).toThrow(
      /Refusing to write outside/u,
    );
  });

  it("rejects absolute paths outside base directory", () => {
    expect(() => resolveInside(baseDir, "/etc/passwd")).toThrow(
      /Refusing to write outside/u,
    );
  });

  it("accepts paths with ./ segments", () => {
    const result = resolveInside(baseDir, "./subdir/./file.md");
    expect(result).toBe(join(baseDir, "subdir/file.md"));
  });

  it("rejects complex traversal attempts", () => {
    expect(() => resolveInside(baseDir, "valid/../../../etc/passwd")).toThrow(
      /Refusing to write outside/u,
    );
  });
});
