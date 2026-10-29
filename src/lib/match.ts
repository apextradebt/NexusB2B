import type { Match, ParsedSpecs, QuoteLine, RawLine, RefModel } from "@/types";
import { CATALOG, phoneStorage } from "@/lib/catalog";

/**
 * Normalise free text so supplier spellings line up with catalog names:
 * accents, "Gen 2" / "G2" / "2nd Gen" / "Génération 2", brand noise, punctuation.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™]/g, "")
    .replace(/\b(\d+)(?:st|nd|rd|th|e|eme|ème)\s*gen(?:eration)?\b/g, "gen $1")
    .replace(/\bgen(?:eration)?\.?\s*(\d+)\b/g, "g$1")
    .replace(/\bg\s+(\d+)\b/g, "g$1")
    .replace(/\bhewlett[- ]packard\b/g, "hp")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const tokens = (s: string) => normalize(s).split(" ").filter(Boolean);

// Words that describe the product type rather than the model; they never discriminate.
const NOISE = new Set(["notebook", "laptop", "pc", "portable", "ordinateur", "smartphone", "phone", "telephone", "mobile", "5g", "4g", "dual", "sim", "ds"]);

// Product-line words suppliers often drop ("Dell 5420", "Samsung S23"): they count, but little.
const LINE_WORDS = new Set(["iphone", "galaxy", "pixel", "thinkpad", "elitebook", "probook", "latitude", "lifebook", "chromebook", "redmi"]);
// Words that turn one model into its sibling ("15 Pro" vs "15 Pro Max").
const SIBLING_WORDS = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "fe", "carbon", "fortis"]);
// Devices quotes do not cover: "Apple Watch Series 7" is no iPhone 7, "Galaxy Tab S7" no Galaxy S7.
const OTHER_KINDS = new Set(["ipad", "tab", "tablet", "tablette", "watch", "montre", "airpods", "buds", "earbuds", "ecouteurs", "pencil", "stylus"]);

const isYear = (t: string) => /^20[0-3]\d$/.test(t);
// Tokens with a digit identify the model ("5420", "g8", "s23"); a release year only helps tell siblings apart.
const isKey = (t: string) => /\d/.test(t) && !isYear(t);
const weight = (t: string) => (isKey(t) ? 3 : isYear(t) ? 1 : LINE_WORDS.has(t) ? 0.5 : 1);

type Indexed = { ref: RefModel; toks: string[]; brand: string };
const INDEX: Indexed[] = CATALOG.map((ref) => ({
  ref,
  // Brand is scored separately so "HP" or "Dell" missing from a line does not sink the score.
  toks: tokens(ref.model).filter((t) => !NOISE.has(t)),
  brand: normalize(ref.brand),
}));

// Words that name a maker: its brand, or a product line only that maker sells.
const TEXT_BRANDS = new Map<string, string>(([
  ...INDEX.map((ix) => [ix.brand, ix.brand]),
  ...["acer", "toshiba", "dynabook", "msi", "razer", "lg", "alcatel", "zte", "vivo", "realme", "tcl", "wiko", "blackberry", "panasonic", "getac"].map((b) => [b, b]),
  ["iphone", "apple"], ["macbook", "apple"], ["imac", "apple"], ["mac", "apple"], ["ipad", "apple"], ["galaxy", "samsung"], ["thinkpad", "lenovo"], ["thinkbook", "lenovo"],
  ["latitude", "dell"], ["precision", "dell"], ["xps", "dell"], ["elitebook", "hp"], ["probook", "hp"], ["zbook", "hp"],
  ["pixel", "google"], ["lifebook", "fujitsu"], ["surface", "microsoft"], ["redmi", "xiaomi"],
] as [string, string][]).filter(([w]) => w.length > 1));

// Shorthand suppliers use for product lines ("MBP 14", "TP T14", "SGS21", "IP13 Pro").
const SHORTHAND: [RegExp, string][] = [
  [/\bmbp\b/g, "macbook pro"],
  [/\bmba\b/g, "macbook air"],
  [/\btp\b/g, "thinkpad"],
  [/\beb\b/g, "elitebook"],
  [/\bpb\b/g, "probook"],
  [/\bzb\b/g, "zbook"],
  [/\blat\b/g, "latitude"],
  [/\bprec\b/g, "precision"],
  [/\bsgs ?(\d)/g, "galaxy s$1"],
  [/\bip ?([4-9]|1\d)\b/g, "iphone $1"],
];

// Every word of the catalogue's names, and the longer plain words a typo can be checked against.
const VOCAB = new Set(INDEX.flatMap((ix) => [...ix.toks, ix.brand]));
const WORDS = [...VOCAB].filter((t) => /^[a-z]{5,}$/.test(t));
// "i5", "m2", "5g" are a CPU or the network, not a word glued to a number.
const NOT_GLUED = /^(?:i[3579]|m[1-5]|[345]g)$/;

/** "850g6" → 850 g6, "lattitude5520" → lattitude 5520, "p30pro" → p30 pro: words the catalogue writes apart. */
function unglue(t: string): string[] {
  if (VOCAB.has(t) || NOT_GLUED.test(t)) return [t];
  // "surfacepro", "macbookair": two catalogue words.
  if (/^[a-z]+$/.test(t)) {
    for (let i = 2; i <= t.length - 2; i++) if (VOCAB.has(t.slice(0, i)) && VOCAB.has(t.slice(i))) return [t.slice(0, i), t.slice(i)];
    return [t];
  }
  if (!/\d/.test(t) || !/[a-z]/.test(t)) return [t];
  const suffix = t.match(/^(.*\d[a-z]?)(pro|max|plus|ultra|mini|lite|fe|g\d{1,2})$/);
  if (suffix) return [...unglue(suffix[1]), suffix[2]];
  const prefix = t.match(/^([a-z]{2,})(\d.*)$/);
  if (prefix) {
    // "motog8" → moto g8, "nokiag20" → nokia g20: the model number keeps its letter.
    const [letters, rest] = [prefix[1], prefix[2]];
    for (let i = letters.length - 1; i >= 2; i--) {
      if (VOCAB.has(letters.slice(0, i)) && VOCAB.has(letters.slice(i) + rest)) return [letters.slice(0, i), letters.slice(i) + rest];
    }
    return [...unglue(letters), ...unglue(rest)];
  }
  return [t];
}

/** At most one letter added, dropped or changed, or two next to each other swapped. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** "elitbook" → elitebook, "iphon" → iphone: a misspelt catalogue word, when only one is that close. */
function spellCheck(t: string): string {
  if (t.length < 5 || VOCAB.has(t) || /\d/.test(t)) return t;
  const near = WORDS.filter((w) => oneEditApart(w, t));
  return near.length === 1 ? near[0] : t;
}

/** "a 53" → a53, "s 21" → s21: a model number written apart from its letters. */
function reglue(ts: string[]): string[] {
  const out: string[] = [];
  for (const t of ts) {
    const prev = out[out.length - 1];
    if (prev && /^[a-z]{1,2}$/.test(prev) && !VOCAB.has(prev) && /^\d/.test(t) && VOCAB.has(prev + t)) out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

/** The words of a line that can name its model: no configuration, glued words apart, shorthand and typos fixed. */
export function modelTokens(text: string): string[] {
  const words = reglue(tokens(stripSpecs(text)).flatMap(unglue).map(spellCheck)).join(" ");
  return SHORTHAND.reduce((s, [rx, to]) => s.replace(rx, to), words).split(" ").filter((t) => t && !NOISE.has(t));
}

/** Score one catalog model against a line's tokens (0–1). */
function scoreRef(ix: Indexed, input: Set<string>, brandHint?: string): number {
  for (const t of input) if (OTHER_KINDS.has(t) && !ix.toks.includes(t)) return 0;
  let total = 0;
  let hit = 0;
  let keyMissing = false;
  for (const t of ix.toks) {
    const w = weight(t);
    total += w;
    if (input.has(t)) {
      hit += w;
    } else if (/^g1$/.test(t) && ![...input].some((x) => /^g\d+$/.test(x))) {
      // No generation given at all → suppliers mean the first generation ("ThinkPad T14s" = Gen 1).
      hit += w * 0.8;
    } else if (isKey(t)) {
      keyMissing = true;
    }
  }
  let score = total ? hit / total : 0;
  if (keyMissing) score = Math.min(score, 0.55);

  // Sibling words or a generation in the input that this model does not have mean a different model.
  const extra = [...input].filter((t) => (SIBLING_WORDS.has(t) || /^g\d+$/.test(t)) && !ix.toks.includes(t));
  score -= 0.15 * extra.length;
  // A year that is not this model's year ("MacBook Pro 14 2023" vs the 2021 one).
  const refYears = ix.toks.filter(isYear);
  if (refYears.length && [...input].some((t) => isYear(t) && !refYears.includes(t))) score -= 0.2;

  if (brandHint) {
    const b = normalize(brandHint);
    if (b && !ix.brand.includes(b) && !b.includes(ix.brand)) score -= 0.3;
  } else {
    // A brand named in the text itself ("Nokia 3310") rules out other brands' models ("Latitude 3310").
    const named = [...input].map((t) => TEXT_BRANDS.get(t)).filter(Boolean);
    if (named.length && !named.includes(ix.brand)) score -= 0.4;
  }
  return Math.max(0, score);
}

const up = (s: string) => s.toUpperCase();
const RAM_OK = (n: number) => [2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 36, 48, 64].includes(n);

/**
 * Remove configuration fragments (CPU, RAM, storage, "16/512") so their numbers do not
 * pass for model numbers ("MacBook Air M1 8/256" is not an iPhone 8).
 */
export function stripSpecs(text: string): string {
  return ` ${text} `
    // "EliteBook 840 G 6": the generation, not an "840 G" capacity.
    .replace(/\b(\d{3,4}) ?g (\d{1,2})\b/gi, "$1 g$2")
    .replace(/\b\d{1,2}\s?(?:gb|go|g)?\s*\/\s*\d{1,4}\s?(?:gb|go|g|tb|to|t)?\b/gi, " ")
    // A bare "T" is terabytes only for 1/2/4 ("1T"): "Xiaomi 13T" or "OnePlus 8T" are model names.
    .replace(/\b(?:\d{1,4}\s?(?:gb|go|g|tb|to)|[124]\s?t)\b(\s*(?:ssd|hdd|nvme|emmc|ram|ddr\d?|lpddr\d?x?|m\.2|pcie))?/gi, " ")
    // "M2 Pro" / "M1 Ultra" name the chip, not a "Pro" or "Ultra" model; the "M2" stays ("MacBook Air M2").
    .replace(/\b(m[1-5])\s+(?:pro|max|ultra)\b/gi, "$1")
    .replace(/\b(?:intel\s*)?(?:core\s*)?i[3579][\s-]*\d{4,5}[a-z]{0,2}\d?\b/gi, " ")
    .replace(/\b(?:intel\s*)?core\s*ultra\s*[579]\s*\d{3}[a-z]\b/gi, " ")
    .replace(/\b(?:amd\s*)?ryzen\s*[3579]\s*(?:pro\s*)?\d{4}[a-z]{1,2}\b/gi, " ")
    .replace(/\b(?:celeron|pentium(?:\s+(?:silver|gold))?)\s*n?\d{4}[a-z]?\b/gi, " ")
    .replace(/\b(?:ssd|hdd|nvme|emmc|ram|ddr\d?|lpddr\d?x?|intel|amd|core|win(?:dows)?\s*1[01](?:\s*pro)?|azerty|qwerty|qwertz|french|fr|uk|us|de)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull CPU / RAM / storage out of free text. Explicit spec columns are tried first by the caller. */
export function parseSpecs(line: Pick<RawLine, "text" | "cpu" | "ram" | "storage">): ParsedSpecs {
  const specs: ParsedSpecs = {};
  const txt = ` ${line.text} `.toLowerCase();
  const cpuTxt = (line.cpu || txt).toLowerCase();

  // Desktop chips have no suffix ("i5-10500"), but "i5 2019" is a year.
  const intel = cpuTxt.match(/\b(i[3579])[\s-]*(?!20[0-3]\d\b)(\d{4,5}[a-z]{0,2}\d?)\b/);
  const ryzen = cpuTxt.match(/ryzen\s*([3579])\s*(pro\s*)?(\d{4}[a-z]{1,2})\b/);
  const low = cpuTxt.match(/\b(celeron|pentium(?:\s+(?:silver|gold))?)\s*(n?\d{4}[a-z]?)\b/);
  const ultra = cpuTxt.match(/\bultra\s*([579])\s*(\d{3}[a-z])\b/);
  const apple = cpuTxt.match(/\b(?:apple\s+)?m([1-5])(?:\s+(pro|max|ultra))?\b(?!\.\d)/);
  if (ultra) specs.cpu = `Core Ultra ${ultra[1]} ${up(ultra[2])}`;
  else if (apple && /apple|mac|\bm[1-5]\b/.test(cpuTxt) && !/m\.2/.test(cpuTxt.slice(apple.index!, apple.index! + 4))) specs.cpu = `Apple M${apple[1]}${apple[2] ? " " + apple[2][0].toUpperCase() + apple[2].slice(1) : ""}`;
  else if (intel) specs.cpu = `${intel[1]}-${up(intel[2])}`;
  else if (ryzen) specs.cpu = `Ryzen ${ryzen[1]} ${ryzen[2] ? "PRO " : ""}${up(ryzen[3])}`;
  else if (low) specs.cpu = `${low[1].replace(/\b\w/g, (c) => c.toUpperCase())} ${up(low[2])}`;
  const tier = cpuTxt.match(/\b(i[3579]|ryzen\s*[3579])\b/);
  if (tier) specs.cpuTier = tier[1].replace(/\s+/, " ");

  const gb = (n: string, unit: string) => (/^t/i.test(unit) ? `${n}TB` : `${n}GB`);
  // "16/512", "8GB/256GB", "i5/16/256": RAM then storage.
  const slash = txt.match(/\b(\d{1,2})\s?(?:gb|go|g)?\s*\/\s*(\d{2,4}|[12])\s?(gb|go|g|tb|to|t)?\b/);
  if (slash && RAM_OK(Number(slash[1])) && (slash[3] ? true : Number(slash[2]) >= 64 || Number(slash[2]) <= 2)) {
    if (!line.ram) specs.ram = `${slash[1]}GB`;
    if (!line.storage) specs.storage = gb(slash[2], slash[3] || (Number(slash[2]) <= 2 ? "tb" : "gb"));
  }
  if (line.ram) {
    const m = line.ram.match(/(\d{1,2})/);
    if (m) specs.ram = `${m[1]}GB`;
  } else if (!specs.ram) {
    const m = txt.match(/\b(\d{1,2})\s?(?:gb|go|g)\s*(?:de\s*)?(?:ram|ddr\d?|lpddr\d?x?|memory|memoire|mémoire)\b/) || txt.match(/\b(?:ram|memory|memoire|mémoire)\s*:?\s*(\d{1,2})\s?(?:gb|go|g)\b/);
    if (m) specs.ram = `${m[1]}GB`;
  }

  if (line.storage) {
    const m = line.storage.match(/(\d{1,4})\s?(gb|go|tb|to)?/i);
    if (m) specs.storage = gb(m[1], m[2] || (Number(m[1]) <= 4 ? "tb" : "gb"));
  } else if (!specs.storage) {
    const m =
      txt.match(/\b(\d{1,4})\s?(gb|go|g|tb|to|t)\s*(?:de\s*)?(?:ssd|nvme|emmc|hdd|m\.2|pcie|storage|stockage)\b/) ||
      txt.match(/\b(?:ssd|nvme|hdd|storage|stockage)\s*:?\s*(\d{1,4})\s?(gb|go|g|tb|to|t)\b/);
    if (m) {
      specs.storage = gb(m[1], m[2]);
      // "i5 16GB 256GB SSD": storage is marked, so the remaining small capacity is the RAM.
      if (!specs.ram) {
        const rest = txt.replace(m[0], " ");
        const ram = [...rest.matchAll(/\b(\d{1,2})\s?(?:gb|go|g)\b/g)].map((x) => Number(x[1])).find((n) => n >= 4 && n <= 64);
        if (ram) specs.ram = `${ram}GB`;
      }
    } else {
      // A lone capacity ("iPhone 13 128GB") or two ("i5 16GB 256GB"): the large one is storage, the small one RAM.
      // "4G" / "5G" are the mobile network, not a capacity.
      const caps = [...txt.matchAll(/\b(\d{1,4})\s?(gb|go|g|tb|to|t)\b/g)].filter((x) => !(x[2] === "g" && Number(x[1]) <= 5) && !(x[2] === "t" && ![1, 2, 4].includes(Number(x[1]))));
      const cap = caps.find((x) => (/^t/i.test(x[2]) && Number(x[1]) <= 8) || Number(x[1]) >= 32);
      if (cap) {
        specs.storage = gb(cap[1], cap[2]);
        const ram = caps.find((x) => x !== cap && !/^t/i.test(x[2]) && RAM_OK(Number(x[1])) && Number(x[1]) < Number(cap[1]));
        if (ram && !specs.ram && !line.ram) specs.ram = `${ram[1]}GB`;
      }
    }
  }
  return specs;
}

const eqCpu = (a: string, b: string) => normalize(a).replace(/\s/g, "") === normalize(b).replace(/\s/g, "");

/**
 * Capacities written without a unit ("Pixel 7a 128", "SGS21 Ultra 256", "Latitude 5420 i5 16 256"), read
 * once the model is known: a bare number is the storage only when the model was sold with it, and not one
 * of the model's own numbers; on a laptop, a smaller bare number among its RAM options is then the RAM.
 */
function bareCapacities(line: Pick<RawLine, "text" | "ram" | "storage">, ref: RefModel, specs: ParsedSpecs): ParsedSpecs {
  if (specs.storage && (specs.ram || ref.category === "phone")) return specs;
  const own = new Set(tokens(ref.model));
  const bare = (s?: string) => (s ? tokens(stripSpecs(s)).filter((t) => /^\d{1,4}$/.test(t) && !own.has(t)).map(Number) : []);
  const nums = [...bare(line.text), ...bare(line.storage), ...bare(line.ram)];
  const storageOptions = ref.category === "phone" ? phoneStorage(ref) : ref.storage ?? [];
  const out = { ...specs };
  if (!out.storage) {
    const hits = nums.filter((n) => n >= 16 && storageOptions.some((s) => s.startsWith(`${n}GB`)));
    // Two different candidates ("64 128") say nothing for sure.
    if (new Set(hits).size === 1) out.storage = `${hits[0]}GB`;
  }
  if (ref.category === "laptop" && !out.ram && out.storage) {
    const cap = Number(out.storage.match(/^\d+/)![0]) * (/TB/.test(out.storage) ? 1024 : 1);
    const rams = nums.filter((n) => n < cap && RAM_OK(n) && (ref.ram ?? []).includes(`${n}GB`));
    if (new Set(rams).size === 1) out.ram = `${rams[0]}GB`;
  }
  return out;
}

/** Resolve parsed specs against the options the model was actually sold with. */
function resolveVariant(ref: RefModel, specs: ParsedSpecs, warnings: string[]) {
  const variant: Match["variant"] = {};
  if (ref.category === "phone") {
    if (specs.storage) variant.storage = specs.storage;
    return variant;
  }
  if (specs.cpu) {
    const hit = ref.cpu?.find((c) => eqCpu(c, specs.cpu!));
    if (hit) variant.cpu = hit;
    // Option lists checked on the manufacturer sheet are authoritative; platform lists are only indicative.
    else if (ref.verified === "platform") warnings.push(`CPU ${specs.cpu} absent de la liste indicative`);
    else warnings.push(`CPU ${specs.cpu} jamais proposé sur ${ref.model}`);
  } else if (specs.cpuTier) {
    const same = ref.cpu?.filter((c) => normalize(c).replace(/\s/g, "").startsWith(specs.cpuTier!.replace(/\s/g, "")));
    if (same?.length === 1) variant.cpu = same[0];
    else if (same && same.length > 1) warnings.push(`CPU ${specs.cpuTier} ambigu (${same.length} options)`);
  }
  const ramOptions = variant.cpu?.startsWith("Ryzen") && ref.ramAmd ? ref.ramAmd : ref.ram;
  if (specs.ram) {
    if (ramOptions?.includes(specs.ram)) variant.ram = specs.ram;
    else warnings.push(`RAM ${specs.ram} hors configurations d'usine`);
  }
  if (specs.storage) {
    const hit = ref.storage?.find((s) => s.startsWith(specs.storage!));
    if (hit) variant.storage = hit;
    else warnings.push(`Stockage ${specs.storage} hors configurations d'usine`);
  }
  if (!variant.cpu && !specs.cpu && !specs.cpuTier) warnings.push("CPU non renseigné");
  if (!variant.ram && !specs.ram) warnings.push("RAM non renseignée");
  if (!variant.storage && !specs.storage) warnings.push("Stockage non renseigné");
  return variant;
}

export function matchLine(line: RawLine): Match {
  const input = new Set(modelTokens(line.text));
  const specs = parseSpecs(line);
  // The CPU pins down the generation when the name does not ("EliteBook 840" + i5-8265U → G6 only).
  const cpuFit = (ref: RefModel) => {
    if (!specs.cpu || ref.category !== "laptop" || !ref.cpu) return 0;
    return ref.cpu.some((c) => eqCpu(c, specs.cpu!)) ? 0.1 : -0.1;
  };
  const ranked = INDEX.map((ix) => {
    const base = scoreRef(ix, input, line.brand);
    // Model words present in the text, and whether all of them are (brand words don't count).
    const words = ix.toks.filter((t) => TEXT_BRANDS.get(t) !== ix.brand);
    const found = words.filter((t) => input.has(t)).length;
    return { ref: ix.ref, score: base > 0.3 ? Math.min(1, Math.max(0, base + cpuFit(ix.ref))) : base, found, full: found === words.length };
  })
    .filter((r) => r.score > 0.3)
    // Ties go to the model with more of its words in the text ("Nord N10" over "OnePlus Nord", whose
    // "OnePlus" is only the brand), then to the more specific one ("iPhone 15 Pro Max" over "iPhone 15").
    .sort((a, b) => b.score - a.score || b.found - a.found || b.ref.model.length - a.ref.model.length);

  const warnings: string[] = [];
  const best = ranked[0];
  if (!best) return { score: 0, status: "unmatched", specs, variant: {}, warnings: ["Aucun modèle du référentiel ne correspond"], alternatives: [] };

  const runnerUp = ranked[1];
  // Not a close call when the text spells out every word of the best model and more of them than the
  // runner-up's ("Galaxy S25 Edge" vs "Galaxy S25", "Pixel 9 Pro XL" vs "Pixel 9 Pro").
  const spelledOut = !!runnerUp && best.full && (!runnerUp.full || best.found > runnerUp.found);
  const close = !!runnerUp && runnerUp.score >= 0.5 && best.score - runnerUp.score < 0.1 && !spelledOut;
  const bestSpecs = bareCapacities(line, best.ref, specs);
  const variant = resolveVariant(best.ref, bestSpecs, warnings);
  const specConflict = warnings.some((w) => w.includes("jamais proposé"));

  let status: Match["status"] = best.score >= 0.85 ? "matched" : best.score >= 0.5 ? "review" : "unmatched";
  if (status === "matched" && (close || specConflict)) status = "review";
  if (close) warnings.unshift(`Proche de ${runnerUp.ref.model}`);

  return {
    ref: status === "unmatched" ? undefined : best.ref,
    score: Math.round(best.score * 100) / 100,
    status,
    specs: status === "unmatched" ? specs : bestSpecs,
    variant: status === "unmatched" ? {} : variant,
    warnings,
    alternatives: ranked.slice(0, 5),
  };
}

/** A quote line's configuration for another model (picked by hand or by the AI), from all the line said. */
export function rematch(l: Pick<QuoteLine, "sampleText" | "quantity" | "source">, ref: RefModel): Match {
  const s = l.source ?? {};
  return matchAgainst({ row: 0, quantity: l.quantity, text: [l.sampleText, s.identified].filter(Boolean).join(" "), cpu: s.cpu, ram: s.ram, storage: s.storage }, ref);
}

/** Re-resolve a line after a user picks the model by hand. */
export function matchAgainst(line: RawLine, ref: RefModel): Match {
  const specs = bareCapacities(line, ref, parseSpecs(line));
  const warnings: string[] = [];
  const variant = resolveVariant(ref, specs, warnings);
  return { ref, score: 1, status: "matched", specs, variant, warnings, alternatives: [] };
}
