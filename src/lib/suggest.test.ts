import { describe, expect, it } from "vitest";
import { queryWords, suggest } from "@/lib/suggest";

/** Suggestions as "Model" or "Model 128GB". */
const list = (q: string, n = 10) => suggest(q, n).map((s) => [s.ref.model, s.variant.storage].filter(Boolean).join(" "));
const models = (q: string, n = 10) => [...new Set(suggest(q, n).map((s) => s.ref.model))];

describe("suggest (quick search, as you type)", () => {
  it("finds a device from the first letters", () => {
    expect(models("iph")[0]).toMatch(/^iPhone/);
    expect(models("latit")[0]).toMatch(/^Latitude/);
    expect(models("thinkp")[0]).toMatch(/^ThinkPad/);
  });

  it("narrows down word by word, with partial words", () => {
    expect(models("iphone 13")[0]).toBe("iPhone 13");
    expect(models("iph 13 mi")).toEqual(["iPhone 13 Mini"]);
    expect(models("iphone 13 pro m")).toEqual(["iPhone 13 Pro Max"]);
    expect(models("latitude 54", 3)).toEqual(["Latitude 5400", "Latitude 5410", "Latitude 5420"]);
    expect(models("latitude 542", 1)).toEqual(["Latitude 5420"]);
    expect(models("elitebook 840 g8", 1)).toEqual(["EliteBook 840 G8"]);
    expect(models("galaxy s23 ul")).toEqual(["Galaxy S23 Ultra"]);
  });

  it("offers every capacity of a phone, smallest first, base model before its siblings", () => {
    expect(list("iphone 13", 3)).toEqual(["iPhone 13 128GB", "iPhone 13 256GB", "iPhone 13 512GB"]);
    expect(models("iphone 13").every((m) => m.startsWith("iPhone 13"))).toBe(true);
    expect(list("galaxy s23 ultra")).toEqual(["Galaxy S23 Ultra 256GB", "Galaxy S23 Ultra 512GB", "Galaxy S23 Ultra 1TB"]);
  });

  it("narrows to the capacity typed, in full or partly, with GB/Go/TB/To", () => {
    expect(list("iphone 13 mini 256go")).toEqual(["iPhone 13 Mini 256GB"]);
    expect(list("iphone 13 mini 256")).toEqual(["iPhone 13 Mini 256GB"]);
    expect(list("iphone 13 mini 5")).toEqual(["iPhone 13 Mini 512GB"]);
    expect(list("galaxy s23 ultra 1to")).toEqual(["Galaxy S23 Ultra 1TB"]);
    expect(list("iphone 13 128GB grade B", 1)).toEqual(["iPhone 13 128GB"]);
  });

  it("keeps laptops as one row per model", () => {
    expect(suggest("latitude 5420", 3).map((s) => [s.ref.model, s.variant])).toEqual([["Latitude 5420", {}]]);
    expect(models("Latitude 5420 i5-1145G7 16/256 A")).toEqual(["Latitude 5420"]);
    expect(models("3x macbook air m1 8/256")).toEqual(["MacBook Air M1 2020"]);
  });

  it("works without the brand, with the brand, and in capitals", () => {
    expect(models("dell latitude 5420")).toEqual(["Latitude 5420"]);
    expect(models("5420")).toEqual(["Latitude 5420"]);
    expect(models("SAMSUNG GALAXY S22")[0]).toBe("Galaxy S22");
    expect(models("t14 gen 2", 1)).toEqual(["ThinkPad T14 Gen 2"]);
    expect(models("thinkpad t14 gen")[0]).toMatch(/^ThinkPad T14/);
  });

  it("ignores the configuration, grade and quantity when reading the model", () => {
    expect(queryWords("iphone 13 mini 128go grade B")).toEqual(["iphone", "13", "mini"]);
  });

  it("returns nothing for nothing", () => {
    expect(suggest("")).toEqual([]);
    expect(suggest("zzzz")).toEqual([]);
    expect(suggest("grade B")).toEqual([]);
    expect(suggest("256")).toEqual([]);
  });
});
