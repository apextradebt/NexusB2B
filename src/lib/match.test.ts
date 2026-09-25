import { describe, expect, it } from "vitest";
import { matchLine, normalize, parseSpecs } from "@/lib/match";
import { buildLines, detectLayout, parseGrade, parseText } from "@/lib/parse";
import { groupLines } from "@/lib/group";
import { priceLine, DEFAULT_SETTINGS } from "@/lib/pricing";
import type { RawLine } from "@/types";

const line = (text: string, extra: Partial<RawLine> = {}): RawLine => ({ row: 1, text, quantity: 1, ...extra });

describe("normalize", () => {
  it("unifies generation spellings", () => {
    expect(normalize("ThinkPad T14 Gen 2")).toBe("thinkpad t14 g2");
    expect(normalize("ThinkPad T14 2nd Gen")).toBe("thinkpad t14 g2");
    expect(normalize("ThinkPad T14 Génération 2")).toBe("thinkpad t14 g2");
    expect(normalize("EliteBook 840 G8")).toBe("elitebook 840 g8");
  });
});

describe("matchLine — laptops", () => {
  it.each([
    ["Dell Latitude 5420", "Latitude 5420"],
    ["DELL LATITUDE 5420 I5-1145G7 16GB 512GB SSD", "Latitude 5420"],
    ["HP EliteBook 840 G8 Notebook PC", "EliteBook 840 G8"],
    ["Lenovo ThinkPad T14 Gen 2", "ThinkPad T14 Gen 2"],
    ["ThinkPad T14 G3", "ThinkPad T14 Gen 3"],
    ["ThinkPad X1 Carbon Gen 10", "ThinkPad X1 Carbon Gen 10"],
    ["LIFEBOOK U7411", "LIFEBOOK U7411"],
  ])("%s → %s", (input, expected) => {
    const m = matchLine(line(input));
    expect(m.ref?.model).toBe(expected);
    expect(m.status).not.toBe("unmatched");
  });

  it("reads a generation-less ThinkPad as Gen 1 (supplier convention)", () => {
    expect(matchLine(line("ThinkPad T14s")).ref?.model).toBe("ThinkPad T14s Gen 1");
    expect(matchLine(line("ThinkPad X13")).ref?.model).toBe("ThinkPad X13 Gen 1");
  });

  it("does not confuse T14 and T14s", () => {
    expect(matchLine(line("ThinkPad T14s Gen 2")).ref?.model).toBe("ThinkPad T14s Gen 2");
    expect(matchLine(line("ThinkPad T14 Gen 2")).ref?.model).toBe("ThinkPad T14 Gen 2");
  });

  it("flags a missing HP generation for review instead of guessing", () => {
    expect(matchLine(line("HP EliteBook 840")).status).not.toBe("matched");
  });

  it("uses the CPU to pick the generation when the name has none", () => {
    const m = matchLine(line("HP EliteBook 840 i5-8265U 8GB 256GB SSD"));
    expect(m.ref?.model).toBe("EliteBook 840 G6");
    expect(m.status).toBe("review");
  });

  it("resolves the variant against factory options", () => {
    const m = matchLine(line("Latitude 5420 Core i5-1145G7 16GB RAM 512GB SSD"));
    expect(m.variant).toEqual({ cpu: "i5-1145G7", ram: "16GB", storage: "512GB" });
    expect(m.status).toBe("matched");
  });

  it("sends a CPU the model never shipped with to review", () => {
    const m = matchLine(line("EliteBook 840 G8 i3-1115G4 8GB 256GB SSD"));
    expect(m.status).toBe("review");
    expect(m.warnings.join()).toMatch(/jamais proposé/);
  });

  it("uses explicit spec columns", () => {
    const m = matchLine(line("ThinkPad T14 Gen 2", { cpu: "AMD Ryzen 5 PRO 5650U", ram: "16", storage: "512 Go" }));
    expect(m.variant).toEqual({ cpu: "Ryzen 5 PRO 5650U", ram: "16GB", storage: "512GB" });
  });
});

describe("matchLine — phones", () => {
  it.each([
    ["Apple iPhone 15 Pro Max 256GB", "iPhone 15 Pro Max"],
    ["iPhone 15 Pro 128 Go", "iPhone 15 Pro"],
    ["iPhone 13", "iPhone 13"],
  ])("%s → %s", (input, expected) => {
    expect(matchLine(line(input)).ref?.model).toBe(expected);
  });

  it("tells S21 and S21+ apart, whatever the spelling", () => {
    expect(matchLine(line("Samsung Galaxy S21+ 128GB")).ref?.model).toBe("Galaxy S21+");
    expect(matchLine(line("Samsung Galaxy S21 Plus")).ref?.model).toBe("Galaxy S21+");
    expect(matchLine(line("Samsung Galaxy S21 128GB")).ref?.model).toBe("Galaxy S21");
  });

  it("gives every catalog entry a unique id", async () => {
    const { CATALOG } = await import("@/lib/catalog");
    expect(new Set(CATALOG.map((r) => r.id)).size).toBe(CATALOG.length);
  });

  it("reads phone capacity", () => {
    expect(matchLine(line("iPhone 13 128GB")).variant.storage).toBe("128GB");
  });

  it("leaves nonsense unmatched", () => {
    expect(matchLine(line("Canon imageRUNNER C3226")).status).toBe("unmatched");
  });
});

describe("parseSpecs", () => {
  it("reads unlabeled RAM when the storage is labeled", () => {
    expect(parseSpecs({ text: "Latitude 5420 i5-1145G7 16GB 256GB SSD" })).toMatchObject({ ram: "16GB", storage: "256GB" });
    expect(parseSpecs({ text: "iPhone 13 128GB" }).ram).toBeUndefined();
  });

  it("separates RAM from storage", () => {
    expect(parseSpecs({ text: "i7-1185G7 / 32 Go RAM / 1 To SSD" })).toMatchObject({ cpu: "i7-1185G7", ram: "32GB", storage: "1TB" });
  });
});

describe("file layouts", () => {
  it("parses one-device-per-row exports", () => {
    const table = parseText("Serial;Marque;Modèle;Processeur;RAM;SSD;Grade\nX1;Dell;Latitude 5420;i5-1145G7;16;256;B\nX2;Dell;Latitude 5420;i5-1145G7;16;256;B\nX3;HP;EliteBook 840 G8;i5-1135G7;8;256;Class C");
    const layout = detectLayout(table);
    expect(layout.mapping).toMatchObject({ Serial: "serial", Marque: "brand", "Modèle": "model", Processeur: "cpu", RAM: "ram", SSD: "storage", Grade: "grade" });
    const lines = buildLines(table, layout);
    const grouped = groupLines(lines, lines.map(matchLine), "C");
    expect(grouped).toHaveLength(2);
    const lat = grouped.find((g) => g.model === "Latitude 5420")!;
    expect(lat.quantity).toBe(2);
    expect(lat.grade).toBe("B");
    expect(lat.variant).toEqual({ cpu: "i5-1145G7", ram: "16GB", storage: "256GB" });
  });

  it("explodes a pivot table (model rows × grade columns)", () => {
    const csv = [
      "Count of Model for Supply,Column Labels,,,,,,",
      "Row Labels,Class A,Class B,Class C,Class D,Class E,(blank),Grand Total",
      "Latitude 5420,1701,9139,5286,66,207,,16399",
      "-,259,2322,978,76,80,,3715",
      "ThinkPad T14s,414,2168,2112,180,4,,4878",
      "Grand Total,2374,13629,8376,322,291,,24992",
    ].join("\n");
    const table = parseText(csv);
    const layout = detectLayout(table);
    expect(Object.values(layout.gradeColumns)).toEqual(["A", "B", "C", "D", "E"]);
    const lines = buildLines(table, layout);
    expect(lines).toHaveLength(10); // 2 models × 5 grades; "-" and "Grand Total" skipped
    expect(lines.reduce((a, l) => a + l.quantity, 0)).toBe(16399 + 4878);
  });

  it("maps grade wording", () => {
    expect(parseGrade("Grade A+")).toBe("A");
    expect(parseGrade("Class D")).toBe("D");
    expect(parseGrade("Très bon état")).toBe("B");
    expect(parseGrade("Pour pièces")).toBe("E");
  });
});

describe("manual entry", () => {
  it("adds a resolved line and merges it with an identical imported one", async () => {
    const { manualLine, mergeDuplicates } = await import("@/lib/group");
    const { getRef } = await import("@/lib/catalog");
    const imported = groupLines([line("Latitude 5420 i5-1145G7 16GB 256GB SSD", { gradeRaw: "B", quantity: 3 })], [matchLine(line("Latitude 5420 i5-1145G7 16GB 256GB SSD"))], "C");
    const manual = manualLine(getRef("DELLATITUDE5420")!, { cpu: "i5-1145G7", ram: "16GB", storage: "256GB" }, "B", 2);
    expect(manual.status).toBe("matched");
    expect(manual.warnings).toEqual([]);
    const merged = mergeDuplicates([...imported, manual]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(5);
  });

  it("warns when a laptop configuration is left blank", async () => {
    const { manualLine } = await import("@/lib/group");
    const { getRef } = await import("@/lib/catalog");
    expect(manualLine(getRef("DELLATITUDE5420")!, {}, "C", 1).warnings).toHaveLength(3);
  });
});

describe("priceLine", () => {
  const base = groupLines([line("Latitude 5420 i5-1145G7 16GB 256GB SSD", { gradeRaw: "B" })], [matchLine(line("Latitude 5420 i5-1145G7 16GB 256GB SSD"))], "C")[0];

  it("derives the buy price from resale − margin − refurbishment", () => {
    const priced = priceLine({ ...base, agentResults: [{ agent: "t", kind: "resale", status: "ok", offers: [{ source: "x", price: 400 }, { source: "y", price: 440 }] }] }, DEFAULT_SETTINGS);
    expect(priced.sellPrice).toBe(420);
    expect(priced.buyPrice).toBe(Math.round(420 * 0.75 - DEFAULT_SETTINGS.refurbCost.laptop.B));
  });

  it("falls back to competitor buyback when no resale price is known", () => {
    const priced = priceLine({ ...base, agentResults: [{ agent: "t", kind: "buyback", status: "ok", offers: [{ source: "x", price: 150 }] }] }, DEFAULT_SETTINGS);
    expect(priced.sellPrice).toBeUndefined();
    expect(priced.buyPrice).toBe(150);
  });

  it("keeps a manual override", () => {
    expect(priceLine({ ...base, buyOverride: 99 }, DEFAULT_SETTINGS).buyPrice).toBe(99);
  });
});
