import { describe, expect, it } from "vitest";
import { buildLines, detectLayout, parseGrade, parseText } from "@/lib/parse";
import { matchLine } from "@/lib/match";
import { sampleLot } from "@/lib/sample";

// Small seeded PRNG (mulberry32) so failures can be reproduced.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const UNKNOWN_BRANDS = ["Canon", "Brother", "Zebra", "Cisco", "Logitech"];

describe("sample lot", () => {
  it("is different on every call", () => {
    const lots = new Set(Array.from({ length: 20 }, () => sampleLot()));
    expect(lots.size).toBe(20);
  });

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("seed %i: every catalog line recognised, with a grade and a quantity", (seed) => {
    const table = parseText(sampleLot(seeded(seed)));
    const lines = buildLines(table, detectLayout(table));
    expect(lines.length).toBe(table.rows.length);
    const known = lines.filter((l) => !UNKNOWN_BRANDS.includes(l.brand ?? ""));
    expect(known.filter((l) => matchLine(l).status !== "matched").map((l) => l.text)).toEqual([]);
    expect(lines.every((l) => parseGrade(l.gradeRaw) && l.quantity > 0)).toBe(true);
  });
});
