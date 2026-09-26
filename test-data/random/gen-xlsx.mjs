// Writes the two random .xlsx files from xlsx-data.json (run generate.py first). Run from nexusb2b/.
import writeXlsxFile from "write-excel-file/node";
import { readFileSync, unlinkSync } from "node:fs";

const dir = "test-data/random/";
const { lot, prices } = JSON.parse(readFileSync(dir + "xlsx-data.json", "utf8"));
const b = (value) => ({ value, fontWeight: "bold" });
const cfg = (d) => (d.cat === "laptop" ? `${d.cpu} / ${d.ram} / ${d.storage}` : d.storage);

await writeXlsxFile([
  [b("Stock export")],
  [],
  [b("Brand"), b("Item"), b("Spec"), b("Grade"), b("Available units")],
  ...lot.map((d) => [d.brand, d.model, cfg(d), d.grade, d.qty]),
], { sheet: "Stock" }).toFile(dir + "lot-13-excel.xlsx");

await writeXlsxFile([
  [b("Fabricant"), b("Référence"), b("Config"), b("Grade"), b("Prix € HT")],
  ...prices.map((d) => [d.brand, d.model, cfg(d), d.grade, d.price]),
], { sheet: "Tarifs" }).toFile(dir + "prix-14-excel.xlsx");

unlinkSync(dir + "xlsx-data.json");
console.log("  lot-13-excel.xlsx\n  prix-14-excel.xlsx");
