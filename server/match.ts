import type { Grade, Query } from "./types.ts";

/** Same spirit as the client matcher: accents, generations, capacities and CPUs written one way. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™]/g, "")
    // "Core i5 11th Gen" is the CPU generation, not the laptop's ("EliteBook 840 G8 i5-11th Gen").
    .replace(/\b(i[3579]|core)[\s-]*(\d{1,2})(?:st|nd|rd|th)\s*gen\b/g, "$1 cpugen$2")
    .replace(/\b(\d+)(?:st|nd|rd|th|e|eme|\.)\s*(?:gen(?:eration)?|generation)\b/g, "gen $1")
    .replace(/\bgen(?:eration)?\.?\s*(\d+)\b/g, "g$1")
    .replace(/\bg\s+(\d+)\b/g, "g$1")
    .replace(/\((\d+)(?:st|nd|rd|th)\s*gen\)/g, "g$1")
    .replace(/\b(\d+)\s*(go|gb)\b/g, "$1gb")
    .replace(/\b(\d+)\s*(to|tb)\b/g, "$1tb")
    .replace(/\b(i[3579])[\s-]+(\d{4,5}[a-z]{1,2}\d?)\b/g, "$1-$2")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const toks = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
const SIBLING = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "fe", "air", "carbon", "yoga", "flip", "fold", "edge", "neo", "slim", "x360", "2-in-1"]);
const MAKERS = ["apple", "samsung", "google", "xiaomi", "huawei", "oneplus", "oppo", "honor", "motorola", "sony", "nokia", "asus", "lenovo", "dell", "hp", "fujitsu", "acer", "microsoft", "toshiba", "msi", "realme", "vivo", "nothing"];

/** Tokens of the product name: everything before the first separator, CPU or capacity. */
function namePart(title: string): string[] {
  // "Ultra 7 155U" is an Intel CPU, not the "Ultra" of a Galaxy S23 Ultra.
  const head = title.split(/\s[|–]\s|\s-\s|,/)[0].replace(/\bultra\s+[579]\s+\d{3}[a-z]\b|\bapple\s+m[1-4]\b/i, " core ");
  const out: string[] = [];
  for (const tok of norm(head).split(" ")) {
    if (/^(i[3579]-|i[3579]$|\d+(gb|tb)$|ryzen$|core$|intel$|amd$)/.test(tok)) break;
    out.push(tok);
  }
  return out;
}

const capacities =(t: Set<string>) => [...t].filter((x) => /^\d+(gb|tb)$/.test(x));
const cpuOf = (s: string) => {
  const n = norm(s);
  return n.match(/\bi[3579]-\d{4,5}[a-z]{1,2}\d?\b/)?.[0] ?? n.match(/\bryzen [3579](?: pro)? \d{4}[a-z]{1,2}\b/)?.[0] ?? n.match(/\bultra [579] \d{3}[a-z]\b/)?.[0];
};

/**
 * Does a listing title describe the queried device? Strict on model numbers and sibling words
 * ("iPhone 13" ≠ "iPhone 13 Pro", "T14" ≠ "T14s"), tolerant on missing details.
 * Returns a 0–1 confidence, 0 = reject.
 */
export function titleMatch(title: string, q: Query): number {
  const t = toks(title);
  const m = toks(q.model);
  const brand = toks(q.brand);
  // A title naming another manufacturer is another device ("Xiaomi Redmi 13" is not an "iPhone 13").
  for (const b of MAKERS) if (t.has(b) && !brand.has(b) && !m.has(b)) return 0;
  const hasGen = [...t].some((x) => /^g\d+$/.test(x));
  for (const tok of m) {
    if (brand.has(tok)) continue;
    if (t.has(tok)) continue;
    if (tok === "g1" && !hasGen) continue; // "ThinkPad T14s" means Gen 1
    return 0;
  }
  // Sibling words only count in the product name, not in the specs after it ("… | Win 11 Pro").
  for (const tok of namePart(title)) {
    if ((SIBLING.has(tok) || /^g\d+$/.test(tok)) && !m.has(tok)) return 0;
  }
  let score = 0.7;
  if (q.storage) {
    const caps = capacities(t);
    const want = norm(q.storage);
    if (caps.length && !caps.includes(want)) {
      // Laptops list RAM and SSD: only reject if no listed capacity is the storage.
      return 0;
    }
    if (caps.includes(want)) score += 0.15;
  }
  if (q.category === "laptop") {
    const c = cpuOf(title);
    if (q.cpu && c) {
      if (!norm(q.cpu).endsWith(c)) return 0;
      score += 0.1;
    }
    if (q.ram) {
      const ramHit = new RegExp(`\\b${norm(q.ram)}\\b`).test(norm(title));
      if (ramHit) score += 0.05;
    }
  }
  return Math.min(1, score);
}

/** Map a source's condition label to our A–E scale. */
export function gradeOf(label?: string): Grade | undefined {
  if (!label) return undefined;
  const l = norm(label);
  if (/\b(a1|premium|parfait|excellent|exzellent|wie neu|comme neuf|like new|mint|eccellente|perfetto|uitstekend|perfecto)\b/.test(l)) return "A";
  if (/\b(a2|tres bon|sehr gut|very good|ottimo|zeer goed|muy bueno)\b/.test(l)) return "B";
  if (/\b(a3|bon|gut|good|buono|goed|bueno)\b/.test(l)) return "C";
  if (/\b(a4|correct|akzeptabel|acceptable|fair|stark genutzt|discreto|redelijk|aceptable)\b/.test(l)) return "D";
  if (/\b(defect|defekt|hs|broken|for parts)\b/.test(l)) return "E";
  const g = l.match(/\bgrade ([a-e])\b/);
  return g ? (g[1].toUpperCase() as Grade) : undefined;
}
