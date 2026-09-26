import type { Grade, Match, PriceListEntry, PricingSettings, QuoteLine, RawLine } from "@/types";
import { buildLines, detectLayout, parseGrade, parsePrice, type Layout, type Table } from "@/lib/parse";
import { matchLine } from "@/lib/match";

type Variant = PriceListEntry["variant"];
const FIELDS = ["cpu", "ram", "storage"] as const;

/** Identity of an entry: the same model, configuration and grade replace each other. */
export const entryKey = (e: Pick<PriceListEntry, "refId" | "variant" | "grade">) =>
  [e.refId, e.variant.cpu ?? "*", e.variant.ram ?? "*", e.variant.storage ?? "*", e.grade ?? "*"].join("|");

export const newEntryId = () => `P-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Add or replace entries (same model + configuration + grade = same entry, the newer price wins). */
export function upsertEntries(list: PriceListEntry[], incoming: PriceListEntry[]): PriceListEntry[] {
  const byKey = new Map(list.map((e) => [entryKey(e), e]));
  for (const e of incoming) {
    const prev = byKey.get(entryKey(e));
    byKey.set(entryKey(e), prev ? { ...e, id: prev.id } : e);
  }
  return [...byKey.values()];
}

export type ListPrice = { price: number; entry: PriceListEntry; note?: string };

/**
 * The customer's price for a quote line. Entries must be for the same model; a configuration or grade
 * left empty on an entry applies to any. The most specific entry wins. When only another grade is
 * priced, the price is scaled with the grade coefficients (Settings) and flagged.
 */
export function findListPrice(
  line: Pick<QuoteLine, "refId" | "variant" | "grade">,
  list: PriceListEntry[],
  gradeCoef: PricingSettings["gradeCoef"],
): ListPrice | undefined {
  if (!line.refId) return undefined;
  let best: { score: number; entry: PriceListEntry; partial: boolean } | undefined;
  for (const entry of list) {
    if (entry.refId !== line.refId) continue;
    let config = 0;
    let partial = false;
    let reject = false;
    for (const f of FIELDS) {
      const want = entry.variant[f];
      if (!want) continue;
      const have = line.variant[f];
      if (!have) partial = true;
      else if (have !== want) reject = true;
      else config += 2;
    }
    if (reject) continue;
    if (partial) config -= 1;
    // The configuration decides first, the grade second: "128GB grade B" scaled to D or E beats a price
    // set for every capacity, so prices of one configuration always fall with the grade.
    const gradeFit = entry.grade === line.grade ? 10 : !entry.grade ? 9 : 8 - Math.abs("ABCDE".indexOf(entry.grade) - "ABCDE".indexOf(line.grade));
    const score = config * 100 + gradeFit;
    if (!best || score > best.score) best = { score, entry, partial };
  }
  if (!best) return undefined;
  const { entry, partial } = best;
  const notes: string[] = [];
  let price = entry.price;
  if (entry.grade && entry.grade !== line.grade) {
    const from = gradeCoef[entry.grade] || 1;
    price = Math.round((entry.price * (gradeCoef[line.grade] ?? from)) / from);
    notes.push(`ajusté du grade ${entry.grade}`);
  }
  if (partial) notes.push("configuration du devis incomplète");
  return { price, entry, note: notes.length ? notes.join(", ") : undefined };
}

// ---------------------------------------------------------------------------------------------
// Import: the same column detection and matching as quotes, with a price column expected.

export type ImportRow = {
  line: RawLine;
  match: Match;
  price?: number;
  currency?: "EUR" | "USD" | "GBP";
  grade?: Grade;
  /** Why the row cannot be imported as is. */
  problem?: "no_model" | "no_price" | "currency";
};

export function detectPriceLayout(table: Table): Layout {
  return detectLayout(table, "prices");
}

export function importRows(table: Table, layout: Layout): ImportRow[] {
  // Lines with neither a known device nor a price are titles or notes ("Nos tarifs revendeurs :").
  const lines = buildLines(table, { ...layout, expect: "prices" }).filter((l) => l.price || matchLine(l).status !== "unmatched");
  return lines.map((line) => {
    const match = matchLine(line);
    const parsed = parsePrice(line.price);
    const grade = parseGrade(line.gradeRaw);
    const problem = !match.ref ? "no_model" : !parsed ? "no_price" : parsed.currency !== "EUR" ? "currency" : undefined;
    return { line, match, price: parsed?.value, currency: parsed?.currency, grade, problem };
  });
}

/** Turn the chosen import rows into entries (one per model + configuration + grade, last one wins). */
export function rowsToEntries(rows: ImportRow[]): PriceListEntry[] {
  const now = new Date().toISOString();
  const out: PriceListEntry[] = [];
  for (const r of rows) {
    if (r.problem || !r.match.ref || r.price === undefined) continue;
    const variant: Variant = r.match.ref.category === "phone" ? { storage: r.match.variant.storage } : { ...r.match.variant };
    out.push({
      id: newEntryId(),
      refId: r.match.ref.id,
      category: r.match.ref.category,
      brand: r.match.ref.brand,
      model: r.match.ref.model,
      variant,
      grade: r.grade,
      price: Math.round(r.price),
      updatedAt: now,
      source: "import",
    });
  }
  return upsertEntries([], out);
}
