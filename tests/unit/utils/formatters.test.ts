import { describe, it, expect, vi } from "vitest";
import { formatTime } from "../../../src/utils/formatters.ts";

describe("formatTime", () => {
  it.each([
    { timeAgo: 30 * 60 * 1000, expected: "recently", description: "30 minutes ago" },
    { timeAgo: 1.5 * 60 * 60 * 1000, expected: "1 hour ago", description: "1.5 hours ago" },
    { timeAgo: 5 * 60 * 60 * 1000, expected: "5 hours ago", description: "5 hours ago" },
    { timeAgo: 24 * 60 * 60 * 1000, expected: "1 day ago", description: "24 hours ago (threshold)" },
    { timeAgo: 36 * 60 * 60 * 1000, expected: "1 day ago", description: "36 hours ago" },
    { timeAgo: 10 * 24 * 60 * 60 * 1000, expected: "10 days ago", description: "10 days ago" },
    { timeAgo: 31 * 24 * 60 * 60 * 1000, expected: "31 days ago", description: "31 days ago" },
    { timeAgo: -1 * 60 * 60 * 1000, expected: "recently", description: "1 hour in the future" },
  ])("should return '$expected' for $description", ({ timeAgo, expected }) => {
    const date = new Date(Date.now() - timeAgo);
    expect(formatTime(date)).toBe(expected);
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
