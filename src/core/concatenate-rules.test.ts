import { describe, expect, it } from "vitest";
import { concatenateRules } from "./concatenate-rules.js";
import type { Rule } from "./rules-fs.js";

describe("concatenate-rules", () => {
  it("returns empty string for empty rule list", () => {
    const result = concatenateRules([]);

    expect(result).toBe("");
  });

  it("returns content as-is for a single rule", () => {
    const rules: Rule[] = [{ path: "a.md", content: "# A" }];

    const result = concatenateRules(rules);

    expect(result).toBe("# A");
  });

  it("separates multiple rules with a Markdown horizontal rule", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n---\n\n# B");
  });

  it("preserves trailing newlines in rule content", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A\n" },
      { path: "b.md", content: "# B\n" },
      { path: "c.md", content: "# C" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n\n---\n\n# B\n\n\n---\n\n# C");
  });
});
