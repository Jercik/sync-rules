import { describe, it, expect, vi } from "vitest";
import { formatTime } from "../../../src/utils/formatters.ts";

describe("formatTime", () => {
  it("should return 'recently' for times less than an hour ago", () => {
    const date = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    expect(formatTime(date)).toBe("recently");
  });

  it("should return '1 hour ago' for times between 1 and 2 hours ago", () => {
    const date = new Date(Date.now() - 1.5 * 60 * 60 * 1000);
    expect(formatTime(date)).toBe("1 hour ago");
  });

  it("should return 'X hours ago' for times more than an hour ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    expect(formatTime(date)).toBe("5 hours ago");
  });

  it("should return '1 day ago' for times between 24 and 48 hours ago", () => {
    const date = new Date(Date.now() - 36 * 60 * 60 * 1000);
    expect(formatTime(date)).toBe("1 day ago");
  });

  it("should return 'X days ago' for times more than a day ago", () => {
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    expect(formatTime(date)).toBe("10 days ago");
  });

  it("should handle the exact 1-hour threshold", () => {
    const date = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(formatTime(date)).toBe("1 hour ago");
  });

  it("should handle the exact 24-hour threshold", () => {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatTime(date)).toBe("1 day ago");
  });

  it("should handle dates in the future as 'recently'", () => {
    const date = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour in the future
    expect(formatTime(date)).toBe("recently");
  });

  it("should be accurate around month boundaries", () => {
    const date = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    expect(formatTime(date)).toBe("31 days ago");
  });

  it("should handle very old dates", () => {
    const date = new Date("2000-01-01T00:00:00.000Z");
    const now = new Date();
    const expectedDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(formatTime(date)).toBe(`${expectedDays} days ago`);
  });
});
