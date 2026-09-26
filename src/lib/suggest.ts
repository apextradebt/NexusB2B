import type { QuoteLine, RefModel } from "@/types";
import { CATALOG, phoneStorage } from "@/lib/catalog";
import { normalize, parseSpecs, stripSpecs } from "@/lib/match";
import { extractInline } from "@/lib/parse";

// Words that never name a model: product types and the grade written in the query.
const NOISE = new Set(["notebook", "laptop", "pc", "portable", "ordinateur", "smartphone", "phone", "telephone", "mobile", "5g", "4g", "reconditionne", "refurbished"]);

export type Suggestion = { ref: RefModel; variant: QuoteLine["variant"] };

/** "128GB" → words a query may use for it: 128, 128gb, 128go (1TB → 1, 1tb, 1to). */
const capacityWords = (s: string) => {
  const m = s.match(/^(\d+)(GB|TB)$/);
  return m ? [m[1], `${m[1]}${m[2].toLowerCase()}`, `${m[1]}${m[2] === "GB" ? "go" : "to"}`] : [normalize(s)];
};

// Laptops: one entry per model (the configuration comes from the query).
// Phones: one entry per model and capacity, so the capacity can be picked straight from the list.
const INDEX = CATALOG.flatMap((ref) => {
  const words = normalize(`${ref.brand} ${ref.model}`).split(" ").filter(Boolean);
  if (ref.category === "laptop") return [{ ref, storage: undefined as string | undefined, words, extra: [] as string[] }];
  return phoneStorage(ref).map((storage) => ({ ref, storage, words, extra: capacityWords(storage) }));
});

/** Query words, without configuration, grade and quantity ("iphone 13 128go grade b" → iphone, 13). */
export function queryWords(q: string): string[] {
  const text = stripSpecs(extractInline(q).text).replace(/\s[A-E]\+?$/, "");
  const words = normalize(text).split(" ").filter((w) => w && !NOISE.has(w));
  // "ThinkPad T14 gen" while typing "gen 2": the dangling word would match nothing yet.
  if (words.length > 1 && /^(gen|generation|g)$/.test(words[words.length - 1])) words.pop();
  return words;
}

/**
 * Devices matching what has been typed so far, best first. Every query word must start a word of the
 * model — or, for phones, of the capacity ("iph 13 mi 25" → iPhone 13 Mini 256GB); numbers must match
 * exactly unless still being typed (last word). A capacity typed in full ("256go") keeps only that one.
 * At equal fit, the shorter model comes first ("iPhone 13" above "iPhone 13 Pro Max"), then capacities
 * from the smallest.
 */
export function suggest(q: string, limit = 10): Suggestion[] {
  const words = queryWords(q);
  const typed = parseSpecs({ text: extractInline(q).text });
  if (!words.length) return [];
  const scored: { s: Suggestion; score: number; order: number }[] = [];
  INDEX.forEach(({ ref, storage, words: rw, extra }, order) => {
    if (storage && typed.storage && storage !== typed.storage) return;
    let score = 0;
    let modelHits = 0;
    let ok = true;
    words.forEach((w, i) => {
      if (!ok) return;
      const last = i === words.length - 1;
      const startsWord = (x: string) => x.startsWith(w) && (last || !/\d/.test(w));
      if (rw.includes(w)) { score += 3 + w.length; modelHits++; }
      else if (rw.some(startsWord)) { score += 1 + w.length / 2; modelHits++; }
      // A number that is no word of the model may be the capacity ("iphone 13 256", "… 12" → 128GB).
      else if (extra.includes(w) || (last && extra.some((x) => x.startsWith(w)))) score += 2;
      else ok = false;
    });
    if (!ok || modelHits === 0) return;
    // Words the model has beyond the query make it a less likely answer (siblings: Pro, Max, Plus…).
    score -= 0.6 * (rw.length - modelHits);
    // Query words from the model's start (brand optional) read as a closer match.
    const start = rw.findIndex((x) => x.startsWith(words[0]));
    if (start >= 0 && start <= 1) score += 1;
    scored.push({ s: { ref, variant: storage ? { storage } : {} }, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.s.ref.model.length - b.s.ref.model.length
      || a.s.ref.model.localeCompare(b.s.ref.model, undefined, { numeric: true }) || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.s);
}
