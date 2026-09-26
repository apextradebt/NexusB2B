import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { buildLines, decode, detectLayout, parseText, toTable, type Table } from "@/lib/parse";
import { matchLine } from "@/lib/match";
import { detectPriceLayout, importRows } from "@/lib/priceList";

// Files from test-data/random/generate.py (seed 2026): random catalog devices in many formats.
const dir = "test-data/random/";
const files = readdirSync(dir).filter((f) => /^(lot|prix)-/.test(f)).sort();

async function load(f: string): Promise<Table> {
  const buf = readFileSync(dir + f);
  if (f.endsWith(".xlsx")) {
    const sheets = (await readXlsxFile(buf)) as unknown as { data: unknown[][] }[];
    return toTable(sheets[0].data.map((r) => r.map((c) => (c == null ? "" : String(c)))));
  }
  return parseText(decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
}

describe("random supplier lots", () => {
  it.each(files.filter((f) => f.startsWith("lot")))("%s: every line recognised, with a grade and a quantity", async (f) => {
    const lines = buildLines(await load(f), detectLayout(await load(f)));
    expect(lines.length).toBeGreaterThan(0);
    const matches = lines.map(matchLine);
    expect(matches.filter((m) => m.status !== "matched").map((m, i) => lines[i].text)).toEqual([]);
    expect(lines.every((l) => l.gradeRaw && l.quantity > 0)).toBe(true);
  });
});

describe("random price lists", () => {
  it.each(files.filter((f) => f.startsWith("prix")))("%s: every price imported except the planted traps", async (f) => {
    const table = await load(f);
    const rows = importRows(table, detectPriceLayout(table));
    expect(rows.length).toBeGreaterThan(0);
    const rejected = rows.filter((r) => r.problem).map((r) => r.problem);
    // prix-11 holds a USD price and an unknown model (Nokia 3310) on purpose.
    expect(rejected).toEqual(f.startsWith("prix-11") ? ["currency", "no_model"] : []);
  });
});
