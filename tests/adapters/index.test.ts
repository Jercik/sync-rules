import { describe, it, expect } from "vitest";
import { getAdapter, adapterRegistry } from "../../src/adapters/index.ts";
import { claudeAdapter } from "../../src/adapters/claude.ts";
import { geminiAdapter } from "../../src/adapters/gemini.ts";
import { kilocodeAdapter } from "../../src/adapters/kilocode.ts";
import type { Adapter } from "../../src/config.ts";

describe("Adapter Registry", () => {
  describe("getAdapter", () => {
    it("should return claude adapter when requested", () => {
      const adapter = getAdapter("claude");
      expect(adapter).toBe(claudeAdapter);
    });

    it("should return gemini adapter when requested", () => {
      const adapter = getAdapter("gemini");
      expect(adapter).toBe(geminiAdapter);
    });

    it("should return kilocode adapter when requested", () => {
      const adapter = getAdapter("kilocode");
      expect(adapter).toBe(kilocodeAdapter);
    });

    it("should throw error for unknown adapter", () => {
      expect(() => getAdapter("unknown" as Adapter)).toThrowError(
        "Unknown adapter: unknown",
      );
    });

    it("should throw error with descriptive message", () => {
      try {
        getAdapter("invalid" as Adapter);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Unknown adapter: invalid");
      }
    });
  });

  describe("adapterRegistry", () => {
    it("should contain all three adapters", () => {
      expect(adapterRegistry.size).toBe(3);
      expect(adapterRegistry.has("claude")).toBe(true);
      expect(adapterRegistry.has("gemini")).toBe(true);
      expect(adapterRegistry.has("kilocode")).toBe(true);
    });

    it("should have correct adapter functions", () => {
      expect(adapterRegistry.get("claude")).toBe(claudeAdapter);
      expect(adapterRegistry.get("gemini")).toBe(geminiAdapter);
      expect(adapterRegistry.get("kilocode")).toBe(kilocodeAdapter);
    });

    it("should be a Map instance", () => {
      expect(adapterRegistry).toBeInstanceOf(Map);
    });
  });
});
