import { describe, expect, it } from "vitest";
import { buildLines, detectLayout, type Table } from "@/lib/parse";
import { matchLine, parseSpecs } from "@/lib/match";
import { groupLines } from "@/lib/group";

// A test-bench export (Blancco-style): one row per unit, a product "Class" next to the real "Grade",
// a battery column whose header says "OEM", the screen size, and 0 where a phone has no CPU speed or RAM.
const headers = ["Class", "Category", "Asset ID", "Part Number", "Mfg", "Model", "Model (Blancco)", "Serial Number", "CPU", "CPU Speed (MHz)", "Memory (GB)", "HDD (GB)", "HDDCount", "Monitor Size", "Grade", "Curr. mAh/OEM (%)"];
const phone = (asset: number, model: string, sku: string, storage: string, grade: string, battery: string, serial: string) =>
  ["COMMUNICATION", "MOBILE PHONES", String(asset), "A2403", "APPLE", sku, model, serial, "", "0", "0", storage, "1", "6.1", grade, battery];
const table: Table = {
  headers,
  rows: [
    ["SYSTEMS", "NOTEBOOKS", "72234131", "A1989", "APPLE", "MACBOOKPRO15,2", "MACBOOKPRO15,2", "C02X600AJHCC", "Intel(R) Core(TM) i7-8559U CPU @ 2.70GHz", "2700", "16", "1000", "1", "13.3", "D", "70"],
    phone(72294834, "IPHONE 12 GSM+CDMA 128GB BLACK", "MGJA3 ZD/A", "128", "A", "87.03", "FFWH22800F0X"),
    phone(72294836, "IPHONE 12 GSM+CDMA 128GB BLACK", "MGJA3 ZD/A", "128", "A", "84.24", "FFWGW1JJ0F0X"),
    phone(72294901, "IPHONE 12 GSM+CDMA 128GB BLACK", "MGJA3 ZD/A", "128", "B", "85.13", "FFWGW1JJ0F1A"),
    phone(72300001, "IPHONE 11 GSM+CDMA 64GB BLACK", "MHDA3 ZD/A", "64", "C", "93.86", "DX3G14JZ0F11"),
    phone(72300002, "IPHONE 14 5G 128GB MIDNIGHT", "MPUF3 ZD/A", "128", "B", "95.15", "DX3G14JZ0F12"),
    phone(72300003, "IPHONE 15 PRO 5G 256GB BLACK TITANIUM", "MTV13 ZD/A", "256", "B", "84.33", "DX3G14JZ0F13"),
    phone(72300004, "IPHONE SE 2ND GEN GSM+CDMA 64GB BLACK", "MHGP3 ZD/A", "64", "B", "84.25", "DX3G14JZ0F14"),
    phone(72300005, "IPHONE 7 GSM 32GB BLACK", "MN8X2 ZD/A", "32", "F", "82.31", "DX3G14JZ0F15"),
  ],
};

describe("tester export, one row per unit", () => {
  const layout = detectLayout(table);

  it("maps the real grade, maker, serial and specs; leaves battery, CPU speed, screen size and asset IDs out", () => {
    expect(layout.mapping).toMatchObject({
      Class: "ignore",
      "Asset ID": "ignore",
      Mfg: "brand",
      "Model (Blancco)": "model",
      "Serial Number": "serial",
      CPU: "cpu",
      "CPU Speed (MHz)": "ignore",
      "Memory (GB)": "ram",
      "HDD (GB)": "storage",
      "Monitor Size": "ignore",
      Grade: "grade",
      "Curr. mAh/OEM (%)": "ignore",
    });
  });

  it("reads terabytes written in gigabytes", () => {
    expect(["1024", "2000", "4096", "8192"].map((storage) => parseSpecs({ text: "", storage }).storage)).toEqual(["1TB", "2TB", "4TB", "8TB"]);
  });

  it("names each phone right and groups units by model, capacity and grade", () => {
    const raw = buildLines(table, layout);
    expect(raw.every((l) => l.quantity === 1)).toBe(true);
    const lines = groupLines(raw, raw.map(matchLine), "C");
    const got = lines.map((l) => `${l.status} ${l.model} ${l.variant.storage ?? ""} ${l.grade} x${l.quantity}`);
    expect(got).toEqual(
      expect.arrayContaining([
        "matched iPhone 12 128GB A x2",
        "matched iPhone 12 128GB B x1",
        "matched iPhone 11 64GB C x1",
        "matched iPhone 14 128GB B x1",
        "matched iPhone 15 Pro 256GB B x1",
        "matched iPhone SE (2020) 64GB B x1",
        "matched iPhone 7 32GB E x1",
      ]),
    );
    // "MacBookPro15,2" alone names no catalogue model (its serial number does): never an iPhone because of its 16 GB of RAM.
    expect(lines.find((l) => l.sourceRows.includes(1))?.category).not.toBe("phone");
  });
});
