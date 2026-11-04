import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { CATALOG } from "@/lib/catalog";
import { generatedLists } from "@/lib/stress/generated";
import { handwrittenLists } from "@/lib/stress/handwritten";
import { holdoutLists } from "@/lib/stress/holdout";
import { blindLists } from "@/lib/stress/blind";
import { runList } from "@/lib/stress/run";

// Every list carries its answer: model, configuration, grade and quantity, line by line.
// Set STRESS_OUT to a path to get the detail as JSON, STRESS_SEEDS (comma-separated) to try other generated lists.
const seeds = (process.env.STRESS_SEEDS ?? "2026").split(",").map(Number);
const all = [...seeds.flatMap((s) => generatedLists(s)), ...handwrittenLists, ...holdoutLists, ...blindLists];

describe("stress lists", () => {
  it("are 100+, and their answers exist in the catalogue", () => {
    expect(all.length).toBeGreaterThanOrEqual(100);
    const names = new Set(CATALOG.map((c) => c.model));
    expect(all.flatMap((l) => l.truth.filter((t) => t.model && !names.has(t.model)).map((t) => `${l.name}: ${t.model}`))).toEqual([]);
  });

  it("all read right", { timeout: 120000 }, () => {
    const results = all.map(runList);
    if (process.env.STRESS_OUT) writeFileSync(process.env.STRESS_OUT, JSON.stringify(results, null, 1));
    expect(results.flatMap((r) => r.issues.map((i) => `${r.name}: ${i.kind} ${i.units} · want ${i.expected} · got ${i.got}`))).toEqual([]);
  });
});
