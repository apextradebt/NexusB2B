import { describe, expect, it } from "vitest";
import { demoShopPrices, normalizeStorage, parseAmount, parsePriceTable, priceRowsToCsv } from "./shopPrices";

describe("shop price files", () => {
  it("reads every way a price gets written", () => {
    const cases: [unknown, number | null | "invalid"][] = [
      ["1.200,50", 1200.5], ["1,200.50", 1200.5], ["1 200,50 €", 1200.5], ["1.200", 1200], ["1,200", 1200],
      ["250,5", 250.5], ["12.5", 12.5], ["300 EUR", 300], [300, 300], ["-", null], ["", null],
      ["1.2.3", "invalid"], ["abc", "invalid"], [-3, "invalid"],
    ];
    for (const [input, expected] of cases) expect(parseAmount(input)).toBe(expected);
  });

  it("finds the header under title rows, one column per grade", () => {
    const { rows, issues } = parsePriceTable([
      ["Grille Q4"], [],
      ["Marque", "Modèle", "Catégorie", "Stockage", "Rachat A", "Vente A"],
      ["Apple", "iPhone 13", "Téléphone", "128 Go", "300", 420],
      ["Dell", "Latitude 5420", "PC", "", 180, 320],
    ], "buy");
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ category: "phone", storage: "128GB", buy: { A: 300 }, sell: { A: 420 } });
    expect(rows[1]).toMatchObject({ category: "laptop", storage: "" });
  });

  it("merges one row per grade into one device", () => {
    const { rows } = parsePriceTable([
      ["Model", "Capacity", "Grade", "Buyback price", "Sell price"],
      ["iPhone 13", "128GB", "A", 300, 420],
      ["iPhone 13", "128GB", "Grade B", 250, 360],
    ], "buy");
    expect(rows).toHaveLength(1);
    expect(rows[0].buy).toEqual({ A: 300, B: 250 });
  });

  it("lets the import button decide what unlabelled columns are", () => {
    const table = [["Modèle", "Grade A"], ["iPhone 13", 420]];
    expect(parsePriceTable(table, "sell").rows[0]).toMatchObject({ sell: { A: 420 }, buy: {} });
    expect(parsePriceTable(table, "buy").rows[0]).toMatchObject({ buy: { A: 420 }, sell: {} });
  });

  it("drops a doubtful line whole and says why", () => {
    const { rows, issues } = parsePriceTable([["Modèle", "Rachat A", "Rachat B"], ["iPhone 11", "abc", 1], ["iPhone 12", 2, 3]], "buy");
    expect(rows.map((r) => r.model)).toEqual(["iPhone 12"]);
    expect(issues).toEqual([{ line: 2, key: "bad_price", values: { model: "iPhone 11", value: "abc" } }]);
  });

  it("refuses a file it cannot read", () => {
    expect(parsePriceTable([["foo", "bar"], [1, 2]], "buy").issues[0].key).toBe("no_columns");
    expect(parsePriceTable([["Modèle", "Prix"], ["iPhone 13", 300]], "buy").issues[0].key).toBe("no_grade");
  });

  it("re-imports its own export", () => {
    const rows = [{ category: "phone" as const, brand: "Apple", model: "iPhone 13", storage: "128GB", buy: { A: 300 }, sell: { A: 420 } }];
    const table = priceRowsToCsv(rows).replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(";"));
    expect(parsePriceTable(table, "buy").rows).toEqual(rows);
  });

  // The data file is local, not in the repository.
  it.runIf(Object.keys(import.meta.glob("/src/data/demo-prices.json")).length > 0)("builds a demo list with a margin on every device and no duplicate", async () => {
    const rows = await demoShopPrices();
    expect(rows.length).toBeGreaterThan(50);
    const keys = rows.map((r) => `${r.category}|${r.model}|${r.storage}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of rows) for (const g of ["A", "B", "C", "D"] as const) {
      if (r.sell[g]) expect(r.buy[g]!).toBeLessThan(r.sell[g]!);
    }
    expect(normalizeStorage(rows[0].storage)).toBe(rows[0].storage);
  });
});
