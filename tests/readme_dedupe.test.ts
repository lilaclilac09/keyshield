import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("README has one copy of each how-to", () => {
  const md = readFileSync(resolve(__dirname, "../README.md"), "utf8");

  it("keeps How to use and Plans, drops the repeated Quickstart and early plans table", () => {
    expect(md).toContain("## How to use this");
    expect(md).toContain("### 4. Plans — business scope");
    expect(md).toContain("### Chrome extension Sign in");
    expect(md).not.toMatch(/^## Quickstart/m);
    expect(md).not.toContain("### Business scope");
    expect(md).not.toContain("### Same vault. Two interfaces.");
    expect((md.match(/node dev\.cjs/g) || []).length).toBe(1);
  });
});
