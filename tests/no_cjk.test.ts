import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const SKIP_SUFFIX = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".ico",
  ".bin",
  ".db",
  ".sqlite",
  ".wasm",
  ".lock",
  ".pyc",
]);

function trackedFiles(): string[] {
  return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function cjkHits(rels: string[], limit = 40): string[] {
  const hits: string[] = [];
  for (const rel of rels) {
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    if (SKIP_SUFFIX.has(ext)) continue;
    let text: string;
    try {
      text = readFileSync(resolve(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    for (const [i, line] of text.split("\n").entries()) {
      if (CJK.test(line)) {
        hits.push(`${rel}:${i + 1}:${line.trim().slice(0, 160)}`);
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

describe("no Chinese in UI or tracked repo files", () => {
  it("src/web and src/extension have no Han characters", () => {
    const ui = trackedFiles().filter(
      (rel) => rel.startsWith("src/web/") || rel.startsWith("src/extension/"),
    );
    expect(ui.length).toBeGreaterThan(20);
    expect(cjkHits(ui)).toEqual([]);
  });

  it("every git-tracked text file has no Han characters", () => {
    expect(cjkHits(trackedFiles())).toEqual([]);
  });
});
