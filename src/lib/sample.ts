import { LAPTOPS, PHONES } from "@/lib/catalog";
import type { RefModel } from "@/types";

/**
 * A random, deliberately messy supplier lot built from the catalog, so "Essayer avec un exemple"
 * shows a different list on every click: serial-numbered laptops to group (spelled differently each
 * time), mixed RAM/disk formats, FR/EN grades, phones with quantities, sometimes a device we don't know.
 */
export function sampleLot(rand: () => number = Math.random): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const chance = (p: number) => rand() < p;

  const rows: string[][] = [];

  // 2–4 laptop configurations, each a few serial-numbered units written differently.
  for (let i = 0, n = int(2, 4); i < n; i++) {
    const m = pick(laptops);
    const cpu = pick(m.cpu!), ram = pick(m.ram!), disk = pick(m.storage!);
    const prefix = pick(SERIAL_PREFIX[m.brand] ?? ["SN"]);
    const grade = pick(GRADES);
    for (let u = 0, units = int(1, 4); u < units; u++) {
      const cpuInText = chance(0.2);
      rows.push([
        prefix + serial(pick, 6),
        u && chance(0.4) ? m.brand.toUpperCase() : m.brand,
        laptopName(m, pick) + (cpuInText ? " " + cpuWords(cpu) : ""),
        cpuInText ? "" : chance(0.3) ? cpuWords(cpu) : cpu,
        ramText(ram, pick),
        diskText(disk, pick),
        gradeText(chance(0.3) ? pick(GRADES) : grade, pick),
        "1",
      ]);
    }
  }

  // A few one-off laptops without a serial.
  for (let i = 0, n = int(1, 3); i < n; i++) {
    const m = pick(laptops);
    rows.push(["", m.brand, laptopName(m, pick), pick(m.cpu!), ramText(pick(m.ram!), pick), diskText(pick(m.storage!), pick), gradeText(pick(GRADES), pick), String(int(1, 8))]);
  }

  // Phones by the box: capacity in the description, quantities.
  for (let i = 0, n = int(3, 5); i < n; i++) {
    const p = pick(phones[pick(PHONE_BRANDS)]);
    const storage = pick(p.storage!);
    const name = `${chance(0.3) ? p.brand + " " : ""}${p.model} ${chance(0.4) ? go(storage) : storage}`;
    rows.push(["", p.brand, name, "", "", "", gradeText(pick(GRADES), pick), String(int(1, 40))]);
  }

  // Sometimes a device outside the catalog, to show a line left for review.
  if (chance(0.5)) {
    const [brand, model] = pick(UNKNOWN);
    rows.push(["", brand, model, "", "", "", gradeText(pick(GRADES), pick), String(int(1, 5))]);
  }

  return [HEADER, ...rows.map((r) => r.join(";"))].join("\n");
}

const HEADER = "Serial;Brand;Description;CPU;Memory;Disk;Condition;Qty";

// What a typical B2B lot holds. Other brands have near-identical names in the catalog ("Redmi 12" /
// "Xiaomi 12", "MacBook Pro 13" / "iPhone 13 Pro") that would open the demo on review flags.
const laptops = LAPTOPS.filter((m) => ["Dell", "HP", "Lenovo", "Fujitsu"].includes(m.brand) && m.cpu?.length && m.ram?.length && m.storage?.length);
// Brand drawn first so iPhones aren't drowned out by Samsung's long range.
const PHONE_BRANDS = ["Apple", "Apple", "Samsung", "Samsung", "Google"];
const phones = Object.fromEntries(PHONE_BRANDS.map((b) => [b, PHONES.filter((p) => p.brand === b && p.storage?.length)]));

const SERIAL_PREFIX: Record<string, string[]> = { HP: ["5CG", "5CD", "CND"], Dell: ["", "HX"], Lenovo: ["PF", "PC", "R9"], Fujitsu: ["YM", "DSAF"] };

const GRADES = ["A", "B", "B", "B", "C", "C", "D", "E"] as const;
const GRADE_WORDS: Record<string, string[]> = {
  A: ["Grade A", "A", "Class A", "Comme neuf", "Excellent"],
  B: ["Grade B", "B", "Class B", "Très bon état", "Very good"],
  C: ["Grade C", "C", "Class C", "Bon état", "Good"],
  D: ["Grade D", "D", "Class D", "Correct", "Fair"],
  E: ["Grade E", "E", "Pour pièces", "Broken"],
};

const UNKNOWN: [string, string][] = [
  ["Canon", "imageRUNNER C3226"],
  ["Brother", "HL-L2350DW"],
  ["Zebra", "TC52 Mobile Computer"],
  ["Cisco", "IP Phone 8841"],
  ["Logitech", "MX Keys"],
];

type Pick = <T>(xs: readonly T[]) => T;

const serial = (pick: Pick, n: number) => Array.from({ length: n }, () => pick([..."ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"])).join("");

const gradeText = (g: string, pick: Pick) => pick(GRADE_WORDS[g]);

const go = (s: string) => s.replace(/GB/, " Go").replace(/TB/, " To");

/** "Latitude 5420", "Dell Latitude 5420", "LATITUDE 5420", "HP EliteBook 840 G8 Notebook PC". */
const laptopName = (m: RefModel, pick: Pick) =>
  pick([m.model, m.model, `${m.brand} ${m.model}`, m.model.toUpperCase(), `${m.brand} ${m.model} ${pick(["Notebook PC", "Laptop", "Portable"])}`]);

/** "i5-1145G7" → "Core i5 1145G7"; other CPUs as they are. */
const cpuWords = (cpu: string) => (/^i\d-/.test(cpu) ? "Core " + cpu.replace("-", " ") : cpu);

const ramText = (ram: string, pick: Pick) => {
  const n = ram.replace(/GB$/, "");
  return pick([ram, `${n} GB`, n, `${n}Go`]);
};

const diskText = (disk: string, pick: Pick) => {
  if (!/^[\d.]+[GT]B$/.test(disk)) return disk; // "500GB HDD", "64GB eMMC"
  const n = disk.slice(0, -2), unit = disk.slice(-2);
  return pick([disk, `${disk} SSD`, `${n} ${unit}`, unit === "GB" ? n : disk]);
};
