import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env-paths to avoid external dependency issues in test environment
vi.mock("env-paths", () => ({
  default: () => ({
    config: "/tmp",
    data: "/tmp",
    cache: "/tmp",
    log: "/tmp",
    temp: "/tmp",
  }),
}));

const originalEnv = process.env;

describe("constants", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("environment variable path normalization", () => {
    it("should normalize SYNC_RULES_CONFIG with tilde expansion", async () => {
      process.env.SYNC_RULES_CONFIG = "~/custom/config.json";

      // Clear module cache to re-evaluate constants
      vi.resetModules();
      const { DEFAULT_CONFIG_PATH } = await import("./constants.js");

      // Should expand ~ and resolve to absolute path
      expect(DEFAULT_CONFIG_PATH).not.toContain("~");
      expect(DEFAULT_CONFIG_PATH).toContain("/custom/config.json");
    });
  });

  // getRulesSource removed; normalization now handled by Zod in Config schema
});
