import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { buildLines, decode, detectLayout, parsePrice, parseText, priceInText, toTable, type Table } from "@/lib/parse";
import { matchLine } from "@/lib/match";
import { groupLines } from "@/lib/group";
import { getRef } from "@/lib/catalog";
import { DEFAULT_SETTINGS, marketGap, priceLine } from "@/lib/pricing";
import { detectPriceLayout, findListPrice, importRows, rowsToEntries, upsertEntries, type ImportRow } from "@/lib/priceList";
import type { PriceListEntry, QuoteLine } from "@/types";

// Dummy customer files in test-data/ (see test-data/README.md).
async function load(name: string): Promise<Table> {
  const buf = readFileSync(`test-data/${name}`);
  if (name.endsWith(".xlsx")) {
    const sheets = (await readXlsxFile(buf)) as unknown as { data: unknown[][] }[] | unknown[][];
    const data = (Array.isArray(sheets[0]) ? sheets : (sheets as { data: unknown[][] }[])[0].data) as unknown[][];
    return toTable(data.map((r) => r.map((c) => (c == null ? "" : String(c)))));
  }
  return parseText(decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
}
async function importFile(name: string) {
  const table = await load(name);
  return importRows(table, detectPriceLayout(table));
}
const summary = (rows: ImportRow[]) => rows.map((r) => [r.match.ref?.model ?? null, r.grade ?? null, r.price ?? null, r.problem ?? "ok"]);

describe("parsePrice", () => {
  it.each([
    ["449,00 €", 449], ["€1,049.00", 1049], ["1 189 €", 1189], ["1.299,90", 1299.9], ["529€", 529], ["289 EUR HT", 289],
    ["899,90", 899.9], ["419.9", 419.9], ["12.000", 12000], ["$899.00", 899],
  ])("%s → %d", (raw, value) => expect(parsePrice(raw)?.value).toBe(value));

  it("keeps the currency and rejects non-amounts", () => {
    expect(parsePrice("$899.00")?.currency).toBe("USD");
    expect(parsePrice("£450")?.currency).toBe("GBP");
    expect(parsePrice("sur demande")).toBeUndefined();
    expect(parsePrice("")).toBeUndefined();
  });

  it("finds the price in free text without eating the configuration", () => {
    expect(priceInText("iPhone 15 Pro Max 256 Go : 1 189 €")).toEqual({ price: "1 189 €", rest: "iPhone 15 Pro Max 256 Go" });
    expect(priceInText("HP EliteBook 840 G7 i5-10310U 8/256 289 EUR HT")?.price).toBe("289 EUR HT");
    expect(priceInText("ThinkPad X1 Carbon Gen 10 i7-1265U 16GB 512GB 899,90 €")?.price).toBe("899,90 €");
    expect(priceInText("Latitude 5420 i5 16 512 420 €")?.price).toBe("420 €");
    expect(priceInText("iPhone 13 128GB")).toBeUndefined();
  });
});

describe("price list import — dummy files", () => {
  it("prix-simple.csv: French headers, one price per model + configuration + grade", async () => {
    const rows = await importFile("prix-simple.csv");
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => !r.problem)).toBe(true);
    expect(rows[0].match.variant).toEqual({ cpu: "i5-1145G7", ram: "16GB", storage: "256GB" });
    expect(summary(rows).slice(0, 3)).toEqual([["Latitude 5420", "A", 449, "ok"], ["Latitude 5420", "B", 399, "ok"], ["Latitude 5420", "B", 429, "ok"]]);
    expect(rowsToEntries(rows)).toHaveLength(8);
  });

  it("price-list-en.csv: € amounts with thousands, a USD row flagged, an unknown model rejected", async () => {
    const rows = await importFile("price-list-en.csv");
    expect(summary(rows)).toEqual([
      ["iPhone 13", "A", 519, "ok"], ["iPhone 13", "B", 469, "ok"], ["iPhone 13 Pro", "A", 1049, "ok"], ["iPhone 12", "B", 329, "ok"],
      ["Galaxy S22", "A", 399, "ok"], ["Galaxy S23 Ultra", "A", 899, "currency"], ["Pixel 7", "B", 279, "ok"], [null, null, 29, "no_model"],
    ]);
    expect(rowsToEntries(rows)).toHaveLength(6);
  });

  it("grille-grades.csv: title rows, one price column per grade, empty cells skipped", async () => {
    const table = await load("grille-grades.csv");
    const layout = detectPriceLayout(table);
    expect(Object.values(layout.gradeColumns)).toEqual(["A", "B", "C", "D"]);
    const rows = importRows(table, layout);
    expect(rows).toHaveLength(14);
    expect(summary(rows.filter((r) => r.match.ref?.model === "iPhone 14 Pro"))).toEqual([["iPhone 14 Pro", "A", 829, "ok"], ["iPhone 14 Pro", "B", 769, "ok"], ["iPhone 14 Pro", "C", 689, "ok"]]);
    expect(rows.every((r) => r.match.variant.storage)).toBe(true);
  });

  it("liste-libre.txt: prices, grades and configurations written in plain text", async () => {
    const rows = await importFile("liste-libre.txt");
    expect(summary(rows)).toEqual([
      ["iPhone 13", "A", 520, "ok"], ["iPhone 15 Pro Max", "A", 1189, "ok"], ["Latitude 7420", "B", 529, "ok"],
      ["EliteBook 840 G7", "C", 289, "ok"], ["ThinkPad X1 Carbon Gen 10", "A", 899.9, "ok"],
    ]);
    expect(rows[3].match.variant).toEqual({ cpu: "i5-10310U", ram: "8GB", storage: "256GB" });
  });

  it("sans-entetes.csv: no header row, plain amounts read as prices", async () => {
    const rows = await importFile("sans-entetes.csv");
    expect(summary(rows)).toEqual([["Latitude 5420", "C", 349, "ok"], ["EliteBook 840 G8", "B", 449, "ok"], ["iPhone 12", "A", 399, "ok"], ["Galaxy S22", "B", 349, "ok"]]);
  });

  it("prix-excel-cp1252.csv: Windows-1252 export from French Excel, grades in words", async () => {
    const table = await load("prix-excel-cp1252.csv");
    expect(table.headers).toEqual(["Désignation", "État", "Prix unitaire HT"]);
    expect(summary(importRows(table, detectPriceLayout(table)))).toEqual([["Latitude 5520", "B", 479, "ok"], ["ProBook 450 G8", "C", 329.5, "ok"], ["ThinkPad L14 Gen 1", "D", 219, "ok"]]);
  });

  it("prix-revendeur.xlsx: Excel file with a title, AMD configs and decimal prices", async () => {
    const rows = await importFile("prix-revendeur.xlsx");
    expect(summary(rows)).toEqual([
      ["ThinkPad T14 Gen 2", "A", 499, "ok"], ["ThinkPad T14 Gen 2", "B", 449, "ok"], ["Latitude 7420", "B", 419.9, "ok"],
      ["iPhone 14 Pro", "A", 849, "ok"], ["Galaxy S23", "B", 419, "ok"],
    ]);
    expect(rows[0].match.variant).toEqual({ cpu: "Ryzen 5 PRO 5650U", ram: "16GB", storage: "512GB" });
    expect(rowsToEntries(rows).find((e) => e.model === "Latitude 7420")?.price).toBe(420);
  });
});

describe("findListPrice", () => {
  const lat = getRef("DELLATITUDE5420")!;
  const entry = (p: Partial<PriceListEntry>): PriceListEntry => ({
    id: Math.random().toString(36), refId: lat.id, category: "laptop", brand: "Dell", model: lat.model, variant: {}, price: 400, updatedAt: "", source: "manual", ...p,
  });
  const cfg = { cpu: "i5-1145G7", ram: "16GB", storage: "256GB" };
  const coef = DEFAULT_SETTINGS.gradeCoef;

  it("prefers the exact configuration and grade", () => {
    const list = [entry({ price: 300 }), entry({ variant: cfg, price: 420 }), entry({ variant: cfg, grade: "B", price: 399 })];
    expect(findListPrice({ refId: lat.id, variant: cfg, grade: "B" }, list, coef)?.price).toBe(399);
    expect(findListPrice({ refId: lat.id, variant: cfg, grade: "A" }, list, coef)?.price).toBe(420);
  });

  it("never uses another configuration's price", () => {
    const list = [entry({ variant: { ...cfg, storage: "512GB" }, price: 480 })];
    expect(findListPrice({ refId: lat.id, variant: cfg, grade: "B" }, list, coef)).toBeUndefined();
  });

  it("scales another grade's price with the grade coefficients and says so", () => {
    const found = findListPrice({ refId: lat.id, variant: cfg, grade: "C" }, [entry({ variant: cfg, grade: "B", price: 399 })], coef)!;
    expect(found.price).toBe(Math.round((399 * coef.C) / coef.B));
    expect(found.note).toMatch(/grade B/);
  });

  it("flags an entry more specific than the quote line", () => {
    const found = findListPrice({ refId: lat.id, variant: { cpu: "i5-1145G7" }, grade: "B" }, [entry({ variant: cfg, grade: "B", price: 399 })], coef)!;
    expect(found.price).toBe(399);
    expect(found.note).toMatch(/incomplète/);
  });

  it("replaces an entry for the same device instead of duplicating it", () => {
    const merged = upsertEntries([entry({ variant: cfg, grade: "B", price: 399 })], [entry({ variant: cfg, grade: "B", price: 379 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].price).toBe(379);
  });
});

describe("priceLine with the price list", () => {
  const cfg = { cpu: "i5-1145G7", ram: "16GB", storage: "256GB" };
  const line = groupLines([{ row: 1, text: "Latitude 5420 i5-1145G7 16GB 256GB SSD", quantity: 1, gradeRaw: "B" }], [matchLine({ row: 1, text: "Latitude 5420 i5-1145G7 16GB 256GB SSD", quantity: 1 })], "C")[0];
  const list: PriceListEntry[] = [{ id: "x", refId: "DELLATITUDE5420", category: "laptop", brand: "Dell", model: "Latitude 5420", variant: cfg, grade: "B", price: 400, updatedAt: "", source: "manual" }];
  const withMarket = (resale: number): QuoteLine => ({ ...line, priceState: "done", agentResults: [{ agent: "t", kind: "resale", status: "ok", offers: [{ source: "x", price: resale }] }] });

  it("sells at the customer's price and keeps the target margin on it", () => {
    const p = priceLine(withMarket(360), DEFAULT_SETTINGS, list);
    expect(p.sellPrice).toBe(400);
    expect(p.buyPrice).toBe(Math.round(400 * 0.75 - DEFAULT_SETTINGS.refurbCost.laptop.B));
    expect(p.priceBasis).toMatch(/^Votre prix/);
    expect(p.marketSell).toBe(360);
    expect(marketGap(p)).toBeCloseTo(40 / 360);
  });

  it("prudent mode takes the market when it is below the customer's price", () => {
    const p = priceLine(withMarket(360), { ...DEFAULT_SETTINGS, listPriceMode: "prudent" }, list);
    expect(p.sellPrice).toBe(360);
    expect(p.listPrice).toBe(400);
    expect(priceLine(withMarket(450), { ...DEFAULT_SETTINGS, listPriceMode: "prudent" }, list).sellPrice).toBe(400);
  });

  it("prices a line from the list even before (or without) market data", () => {
    const p = priceLine(line, DEFAULT_SETTINGS, list);
    expect(p.sellPrice).toBe(400);
    expect(p.buyPrice).toBeDefined();
  });
});

describe("end to end: price lists + supplier lot", () => {
  it("quotes devis-fournisseur.csv against the imported price lists", async () => {
    const entries = upsertEntries(rowsToEntries(await importFile("prix-simple.csv")), rowsToEntries(await importFile("grille-grades.csv")));
    const table = await load("devis-fournisseur.csv");
    const raw = buildLines(table, detectLayout(table));
    const lines = groupLines(raw, raw.map(matchLine), "C").map((l) => priceLine(l, DEFAULT_SETTINGS, entries));
    const at = (model: string, grade: string) => lines.find((l) => l.model === model && l.grade === grade)!;

    expect(at("Latitude 5420", "B").sellPrice).toBe(399); // exact
    expect(at("Latitude 5420", "C").sellPrice).toBe(Math.round((399 * 0.7) / 0.85)); // from grade B
    expect(at("EliteBook 840 G8", "A").sellPrice).toBe(489);
    expect(at("ThinkPad T14 Gen 2", "B").sellPrice).toBe(455);
    expect(at("iPhone 14", "C").sellPrice).toBe(469); // grade grid
    expect(at("Galaxy S21", "D").sellPrice).toBe(Math.round((219 * 0.5) / 0.7)); // D empty in the grid → from C
    expect(at("iPhone 13", "B").listPrice).toBeUndefined(); // not in these lists
    expect(at("Latitude 7490", "C").sellPrice).toBeUndefined(); // no list price, no market data here

    for (const l of lines.filter((x) => x.listPrice !== undefined)) {
      const refurb = DEFAULT_SETTINGS.refurbCost[l.category!][l.grade];
      expect(l.buyPrice).toBe(Math.max(0, Math.round(l.sellPrice! * 0.75 - refurb)));
    }
  });
});
