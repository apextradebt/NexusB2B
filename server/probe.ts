/**
 * Try every source on a device from the command line:
 *   npm run probe -- phone Apple "iPhone 13" 128GB B
 *   npm run probe -- laptop Dell "Latitude 5420" i5-1145G7 16GB 256GB B
 */
import { price } from "./engine.ts";
import type { Category, Grade, Query } from "./types.ts";

const [category, brand, model, ...rest] = process.argv.slice(2);
const grade = (rest.pop() || "B") as Grade;
const q: Query =
  category === "laptop"
    ? { category: "laptop" as Category, brand, model, cpu: rest[0], ram: rest[1], storage: rest[2], grade }
    : { category: "phone" as Category, brand, model, storage: rest[0], grade };

const r = await price(q);
console.log(`\n${brand} ${model} ${rest.join(" ")} — grade ${grade}\n`);
for (const s of r.sources) {
  const p = r.prices.filter((x) => x.source === s.id).map((x) => `${x.kind === "buyback" ? "rachat" : "revente"} ${x.price}€${x.grade && x.grade !== grade ? ` (grade ${x.grade})` : ""} [${x.count}]`).join(" · ");
  console.log(`${s.status.padEnd(15)} ${s.name.padEnd(22)} ${String(s.ms).padStart(6)} ms  ${p || s.message || ""}`);
}
const n = (k: string) => new Set(r.prices.filter((p) => p.kind === k).map((p) => p.source)).size;
console.log(`\n→ ${n("buyback")} sources de rachat, ${n("resale")} sources de revente`);
