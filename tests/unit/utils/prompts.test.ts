import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirm, select } from "../../../src/utils/prompts.ts";

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("confirm", () => {
  let mockRl: any;

  beforeEach(async () => {
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    const { createInterface } = vi.mocked(
      await import("node:readline/promises"),
    );
    createInterface.mockReturnValue(mockRl);
  });

  it("should return true for 'y'", async () => {
    mockRl.question.mockResolvedValue("y");

    const result = await confirm("Continue?");

    expect(result).toBe(true);
    expect(mockRl.close).toHaveBeenCalled();
  });

  it("should return true for 'yes'", async () => {
    mockRl.question.mockResolvedValue("yes");

    const result = await confirm("Continue?");

    expect(result).toBe(true);
  });

  it("should return false for 'n'", async () => {
    mockRl.question.mockResolvedValue("n");

    const result = await confirm("Continue?");

    expect(result).toBe(false);
  });

  it("should return false for 'no'", async () => {
    mockRl.question.mockResolvedValue("no");

    const result = await confirm("Continue?");

    expect(result).toBe(false);
  });

  it("should return false for empty input", async () => {
    mockRl.question.mockResolvedValue("");

    const result = await confirm("Continue?");

    expect(result).toBe(false);
  });

  it("should handle case insensitive input", async () => {
    mockRl.question.mockResolvedValue("YES");

    const result = await confirm("Continue?");

    expect(result).toBe(true);
  });

  it("should handle whitespace", async () => {
    mockRl.question.mockResolvedValue(" y ");

    const result = await confirm("Continue?");

    expect(result).toBe(true);
  });
});

describe("select", () => {
  let mockRl: any;

  beforeEach(async () => {
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    const { createInterface } = vi.mocked(
      await import("node:readline/promises"),
    );
    createInterface.mockReturnValue(mockRl);
  });

  it("should return selected choice", async () => {
    mockRl.question.mockResolvedValue("1");

    const options = [
      { label: "Option A", value: "a" },
      { label: "Option B", value: "b" },
      { label: "Option C", value: "c" },
    ];
    const result = await select("Choose:", options);

    expect(result).toBe("a");
  });

  it("should handle invalid choice and reprompt", async () => {
    let callCount = 0;
    mockRl.question.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return "99";
      } else {
        return "2";
      }
    });

    const options = [
      { label: "Option A", value: "a" },
      { label: "Option B", value: "b" },
    ];
    const result = await select("Choose:", options);

    expect(result).toBe("b");
    expect(mockRl.question).toHaveBeenCalledTimes(2);
  });

  it("should handle non-numeric input", async () => {
    let callCount = 0;
    mockRl.question.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return "abc";
      } else {
        return "1";
      }
    });

    const options = [
      { label: "Option A", value: "a" },
      { label: "Option B", value: "b" },
    ];
    const result = await select("Choose:", options);

    expect(result).toBe("a");
  });
});
