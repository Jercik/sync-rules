import { describe, expect, it } from "vitest";
import { concatenateRules } from "./concatenate-rules.js";
import type { Rule } from "./rules-fs.js";

describe("concatenate-rules", () => {
  it("returns empty string for empty rule list", () => {
    const result = concatenateRules([]);

    expect(result).toBe("");
  });

  it("inserts one blank line when boundary has no newline", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n# B");
  });

  it("normalizes previous trailing newline to one blank line", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A\n" },
      { path: "b.md", content: "# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n# B");
  });

  it("normalizes next leading newline to one blank line", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "\n# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n# B");
  });

  it("normalizes existing multi-newline boundaries to one blank line", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A\n\n" },
      { path: "b.md", content: "# B" },
      { path: "c.md", content: "\n# C" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n# B\n\n# C");
  });
});
