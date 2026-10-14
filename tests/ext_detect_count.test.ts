import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Live detect card: "N collected" and "Saved N keys" must agree. The harvest
// state's `saved` already includes queued rows, so adding `queued` doubled it.
describe("live detect panel saved count", () => {
  const bg = readFileSync("src/extension/background.js", "utf8");
  const start = bg.indexOf("function paintLiveDetectPanel(");
  const end = bg.indexOf("\n}\n", start);
  // eslint-disable-next-line no-new-func
  const paint = new Function(`${bg.slice(start, end + 2)}; return paintLiveDetectPanel;`)();

  it("4 harvested keys (saved + queued) reports Saved 4", () => {
    const html: string[] = [];
    const card = { style: {}, set innerHTML(v: string) { html.push(v); } };
    (globalThis as any).document = {
      querySelectorAll: () => [],
      getElementById: () => card,
    };
    const keys = [1, 2, 3, 4].map((i) => ({ upstream: "helius", masked: `k${i}`, saved: true }));
    paint({ signed: true, keys, saved: 4, failed: 0, queued: 4, filled: 0, ms: 5 });
    expect(html[0]).toContain("4 collected");
    expect(html[0]).toContain("Saved 4 keys to KeyShield vault.");
    expect(html[0]).not.toContain("Saved 8");
  });
});
