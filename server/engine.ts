import { SourceError, toEur } from "./http.ts";
import { norm, titleMatch } from "./match.ts";
import { SOURCES } from "./sources/index.ts";
import type { Grade, Kind, Offer, Query, Source, SourceReport } from "./types.ts";

const ORDER: Grade[] = ["A", "B", "C", "D", "E"];

/**
 * Keep the offers for the requested grade. If a source does not have that grade, fall back to the
 * nearest *worse* grade first (conservative), then the nearest better one, then ungraded offers.
 */
function pickGrade(offers: Offer[], grade: Grade): { offers: Offer[]; usedGrade?: Grade } {
  const graded = offers.filter((o) => o.grade);
  if (graded.length === 0) return { offers };
  const at = ORDER.indexOf(grade);
  const tryOrder = [...ORDER.slice(at), ...ORDER.slice(0, at).reverse()];
  for (const g of tryOrder) {
    const hit = graded.filter((o) => o.grade === g);
    if (hit.length) return { offers: hit, usedGrade: g };
  }
  return { offers };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type SourcePrice = {
  source: string;
  sourceName: string;
  country: string;
  kind: Kind;
  price: number;
  min: number;
  max: number;
  count: number;
  grade?: Grade;
  url: string;
  /** Up to 3 distinct listings behind this price, cheapest first. */
  urls: string[];
  note?: string;
  /** Price as the site shows it (non-EUR sources), and the site's condition label when all offers share one. */
  native?: { price: number; currency: string };
  condition?: string;
};

export type PriceResult = { query: Query; prices: SourcePrice[]; sources: SourceReport[]; offers: Offer[] };

async function runSource(src: Source, q: Query): Promise<{ report: SourceReport; offers: Offer[] }> {
  const base = { id: src.id, name: src.name, country: src.country, kinds: src.kinds };
  if (!src.categories.includes(q.category) || (src.supports && !src.supports(q))) {
    return { report: { ...base, status: "not_applicable", count: 0, ms: 0 }, offers: [] };
  }
  const t0 = Date.now();
  try {
    const raw = (await src.run(q)).filter((o) => o.price > 0);
    let kept = raw.filter((o) => titleMatch(o.title, q) > 0);
    // Laptops: when nothing matches the exact configuration, accept the same model + CPU with another
    // RAM / SSD size (clearly flagged) rather than returning nothing.
    if (kept.length === 0 && q.category === "laptop") {
      const loose = { ...q, ram: undefined, storage: undefined };
      kept = raw.filter((o) => titleMatch(o.title, loose) > 0).map((o) => ({ ...o, note: o.note ?? "Configuration proche (RAM/SSD différents)" }));
    }
    // Phones: same model in another capacity rather than nothing (clearly flagged).
    if (kept.length === 0 && q.category === "phone" && q.storage) {
      kept = raw.filter((o) => titleMatch(o.title, { ...q, storage: undefined }) > 0).map((o) => ({ ...o, note: o.note ?? "Autre capacité que celle demandée — indicatif" }));
    }
    // Still nothing: same model with another CPU, same CPU tier (i5 for an i5) first. Indicative only.
    if (kept.length === 0 && q.category === "laptop") {
      const anyCpu = raw.filter((o) => titleMatch(o.title, { ...q, cpu: undefined, ram: undefined, storage: undefined }) > 0);
      const tier = q.cpu?.match(/\b(i[3579]|ryzen [3579]|ultra [579])/i)?.[1]?.toLowerCase();
      const sameTier = tier ? anyCpu.filter((o) => norm(o.title).includes(tier)) : [];
      kept = (sameTier.length ? sameTier : anyCpu).map((o) => ({
        ...o,
        note: o.note ?? (sameTier.length ? "Même modèle, autre processeur de même gamme — indicatif" : "Même modèle, autre configuration — indicatif"),
      }));
    }
    const offers: Offer[] = [];
    for (const o of kept) offers.push({ ...o, source: src.id, sourceName: src.name, country: src.country, priceEur: await toEur(o.price, o.currency) });
    return { report: { ...base, status: offers.length ? "ok" : "empty", count: offers.length, ms: Date.now() - t0 }, offers };
  } catch (e) {
    const code = e instanceof SourceError ? e.code : "error";
    const status = code === "blocked" ? "blocked" : code === "robots" ? "robots" : "error";
    return { report: { ...base, status, count: 0, ms: Date.now() - t0, message: (e as Error).message }, offers: [] };
  }
}

export async function price(q: Query): Promise<PriceResult> {
  const results = await Promise.all(SOURCES.filter((s) => !s.fallback).map((s) => runSource(s, q)));
  // Classifieds only when no professional source has a resale price for this device.
  const fallbacks = SOURCES.filter((s) => s.fallback);
  if (!results.some((r) => r.offers.some((o) => o.kind === "resale"))) {
    results.push(...(await Promise.all(fallbacks.map((s) => runSource(s, q)))));
  } else {
    for (const s of fallbacks) {
      results.push({ report: { id: s.id, name: s.name, country: s.country, kinds: s.kinds, status: "not_applicable", count: 0, ms: 0, message: "Non utilisé : prix professionnels trouvés" }, offers: [] });
    }
  }
  const prices: SourcePrice[] = [];
  for (const { offers } of results) {
    for (const kind of ["buyback", "resale"] as Kind[]) {
      const own = offers.filter((o) => o.kind === kind);
      if (own.length === 0) continue;
      const { offers: kept, usedGrade } = pickGrade(own, q.grade);
      const eur = kept.map((o) => o.priceEur);
      const cheapest = kept.reduce((a, b) => (b.priceEur < a.priceEur ? b : a));
      const currencies = new Set(kept.map((o) => o.currency));
      const conditions = new Set(kept.map((o) => o.condition));
      const [currency] = currencies;
      const [condition] = conditions;
      prices.push({
        source: kept[0].source,
        sourceName: kept[0].sourceName,
        country: kept[0].country,
        kind,
        price: Math.round(median(eur)),
        min: Math.round(Math.min(...eur)),
        max: Math.round(Math.max(...eur)),
        count: kept.length,
        grade: usedGrade,
        url: cheapest.url,
        urls: [...new Set([...kept].sort((a, b) => a.priceEur - b.priceEur).map((o) => o.url))].slice(0, 3),
        note: kept.find((o) => o.note)?.note ?? (usedGrade && usedGrade !== q.grade ? `Grade ${usedGrade} utilisé (pas d'offre en ${q.grade})` : undefined),
        native: currencies.size === 1 && currency !== "EUR" ? { price: Math.round(median(kept.map((o) => o.price))), currency } : undefined,
        condition: conditions.size === 1 && condition ? condition : undefined,
      });
    }
  }
  return { query: q, prices, sources: results.map((r) => r.report), offers: results.flatMap((r) => r.offers) };
}
