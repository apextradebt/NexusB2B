/**
 * Price every catalog device once and report which ones the agents leave without a buyback or resale price.
 *   npm run audit                       → all devices, results in audit-results.jsonl (resumable)
 *   npm run audit -- laptop             → laptops only
 *   npm run audit -- phone --fresh      → phones only, ignore previous results
 *   npm run audit -- --retry            → price again the devices that lacked a resale or buyback price
 * Each device is queried in a representative configuration (an i5 / 16 GB / 256 GB laptop, the base-storage phone), grade C.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { price, type PriceResult } from "./engine.ts";
import type { Category, Query } from "./types.ts";
import { LAPTOPS, PHONES } from "../src/lib/catalog.ts";
import type { RefModel } from "../src/types.ts";

const OUT = "audit-results.jsonl";
const args = process.argv.slice(2);
const only = args.find((a) => a === "laptop" || a === "phone") as Category | undefined;
const fresh = args.includes("--fresh");
const CONCURRENCY = 3;
// When the price server is running, go through it: one process means one rate limit per site.
const SERVER = process.env.PRICE_API_URL || "http://localhost:8787";
const viaServer = await fetch(`${SERVER}/api/sources`).then((r) => r.ok, () => false);
const priceOf = async (q: Query): Promise<PriceResult> =>
  viaServer ? (await fetch(`${SERVER}/api/price`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) })).json() : price(q);

const pick = (xs: string[] | undefined, prefer: RegExp[]) => {
  if (!xs?.length) return undefined;
  for (const re of prefer) {
    const hit = xs.find((x) => re.test(x));
    if (hit) return hit;
  }
  return xs[Math.floor(xs.length / 2)];
};

export function sampleQuery(ref: RefModel): Query {
  if (ref.category === "laptop") {
    return {
      category: "laptop",
      brand: ref.brand,
      model: ref.model,
      cpu: pick(ref.cpu, [/^i5-/i, /ryzen 5/i, /ultra 5/i, /^m\d$/i]),
      ram: pick(ref.ram, [/^16GB$/, /^8GB$/]),
      storage: pick(ref.storage?.filter((s) => !/hdd/i.test(s)), [/^256GB$/, /^512GB$/]),
      grade: "C",
    };
  }
  return { category: "phone", brand: ref.brand, model: ref.model, storage: pick(ref.storage, [/^128GB$/, /^64GB$/]) ?? "128GB", grade: "C" };
}

const devices = [...LAPTOPS, ...PHONES].filter((r) => !only || r.category === only);
if (fresh && existsSync(OUT)) writeFileSync(OUT, "");
// --retry: drop previous results without a resale or buyback price so those devices are priced again.
if (args.includes("--retry") && existsSync(OUT)) {
  const kept = readFileSync(OUT, "utf8").split("\n").filter(Boolean).filter((l) => {
    const r = JSON.parse(l);
    return (only && r.category !== only) || (r.resale.length && r.buyback.length);
  });
  writeFileSync(OUT, kept.map((l) => l + "\n").join(""));
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
const todo = devices.filter((d) => !done.has(d.id));
console.log(`${devices.length} devices, ${done.size} already done, ${todo.length} to go${viaServer ? ` (via ${SERVER})` : ""}`);

let i = 0;
async function worker() {
  while (i < todo.length) {
    const ref = todo[i++];
    const q = sampleQuery(ref);
    const t0 = Date.now();
    const r = await priceOf(q);
    const by = (k: string) => [...new Set(r.prices.filter((p) => p.kind === k).map((p) => p.source))];
    const row = {
      id: ref.id,
      category: ref.category,
      brand: ref.brand,
      model: ref.model,
      year: ref.year,
      query: q,
      buyback: by("buyback"),
      resale: by("resale"),
      approx: r.prices.filter((p) => p.note).map((p) => `${p.source}:${p.note}`),
      errors: r.sources.filter((s) => s.status === "error" || s.status === "blocked" || s.status === "robots").map((s) => `${s.id}:${s.status}:${s.message}`),
      ms: Date.now() - t0,
    };
    appendFileSync(OUT, JSON.stringify(row) + "\n");
    console.log(`${String(done.size + i).padStart(4)}/${devices.length} ${ref.category.padEnd(6)} ${`${ref.brand} ${ref.model}`.padEnd(40)} rachat ${row.buyback.length} · revente ${row.resale.length}${row.errors.length ? ` · ${row.errors.length} err` : ""}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Summary over everything in the results file.
const rows = readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const cat of ["laptop", "phone"]) {
  const c = rows.filter((r) => r.category === cat);
  if (!c.length) continue;
  const none = c.filter((r) => !r.resale.length && !r.buyback.length).length;
  console.log(`\n${cat}: ${c.length} devices · no resale ${c.filter((r) => !r.resale.length).length} · no buyback ${c.filter((r) => !r.buyback.length).length} · nothing at all ${none}`);
}
