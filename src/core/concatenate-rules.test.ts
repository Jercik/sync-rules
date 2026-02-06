import { describe, expect, it } from "vitest";
import { concatenateRules } from "./concatenate-rules.js";
import type { Rule } from "./rules-fs.js";

describe("concatenate-rules", () => {
  it("returns empty string for empty rule list", () => {
    const result = concatenateRules([]);

    expect(result).toBe("");
  });

  it("inserts a single newline when boundary has no newline", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n# B");
  });

  it("does not insert newline when previous rule already ends with newline", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A\n" },
      { path: "b.md", content: "# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n# B");
  });

  it("does not insert newline when next rule already starts with newline", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "\n# B" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n# B");
  });

  it("keeps existing blank-line boundaries unchanged", () => {
    const rules: Rule[] = [
      { path: "a.md", content: "# A\n\n" },
      { path: "b.md", content: "# B" },
      { path: "c.md", content: "\n# C" },
    ];

    const result = concatenateRules(rules);

    expect(result).toBe("# A\n\n# B\n# C");
  });
});
