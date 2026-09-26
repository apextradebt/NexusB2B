import type { Match, ParsedSpecs, RawLine, RefModel } from "@/types";
import { CATALOG } from "@/lib/catalog";

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

/** Score one catalog model against a line's tokens (0–1). */
function scoreRef(ix: Indexed, input: Set<string>, brandHint?: string): number {
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
    .replace(/\b\d{1,2}\s?(?:gb|go|g)?\s*\/\s*\d{1,4}\s?(?:gb|go|g|tb|to|t)?\b/gi, " ")
    .replace(/\b\d{1,4}\s?(?:gb|go|g|tb|to|t)\b(\s*(?:ssd|hdd|nvme|emmc|ram|ddr\d?|lpddr\d?x?|m\.2|pcie))?/gi, " ")
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

  const intel = cpuTxt.match(/\b(i[3579])[\s-]*(\d{4,5}[a-z]{1,2}\d?)\b/);
  const ryzen = cpuTxt.match(/ryzen\s*([3579])\s*(pro\s*)?(\d{4}[a-z]{1,2})\b/);
  const low = cpuTxt.match(/\b(celeron|pentium(?:\s+(?:silver|gold))?)\s*(n?\d{4}[a-z]?)\b/);
  const ultra = cpuTxt.match(/\bultra\s*([579])\s*(\d{3}[a-z])\b/);
  const apple = cpuTxt.match(/\b(?:apple\s+)?m([1-4])(?:\s+(pro|max))?\b(?!\.\d)/);
  if (ultra) specs.cpu = `Core Ultra ${ultra[1]} ${up(ultra[2])}`;
  else if (apple && /apple|macbook|\bm[1-4]\b/.test(cpuTxt) && !/m\.2/.test(cpuTxt.slice(apple.index!, apple.index! + 4))) specs.cpu = `Apple M${apple[1]}${apple[2] ? " " + apple[2][0].toUpperCase() + apple[2].slice(1) : ""}`;
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
      const caps = [...txt.matchAll(/\b(\d{1,4})\s?(gb|go|g|tb|to|t)\b/g)].filter((x) => !(x[2] === "g" && Number(x[1]) <= 5));
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
  const input = new Set(tokens(stripSpecs(line.text)).filter((t) => !NOISE.has(t)));
  const specs = parseSpecs(line);
  // The CPU pins down the generation when the name does not ("EliteBook 840" + i5-8265U → G6 only).
  const cpuFit = (ref: RefModel) => {
    if (!specs.cpu || ref.category !== "laptop" || !ref.cpu) return 0;
    return ref.cpu.some((c) => eqCpu(c, specs.cpu!)) ? 0.1 : -0.1;
  };
  const ranked = INDEX.map((ix) => {
    const base = scoreRef(ix, input, line.brand);
    return { ref: ix.ref, score: base > 0.3 ? Math.min(1, Math.max(0, base + cpuFit(ix.ref))) : base };
  })
    .filter((r) => r.score > 0.3)
    // Ties go to the more specific model ("iPhone 15 Pro Max" over "iPhone 15").
    .sort((a, b) => b.score - a.score || b.ref.model.length - a.ref.model.length);

  const warnings: string[] = [];
  const best = ranked[0];
  if (!best) return { score: 0, status: "unmatched", specs, variant: {}, warnings: ["Aucun modèle du référentiel ne correspond"], alternatives: [] };

  const runnerUp = ranked[1];
  const close = !!runnerUp && runnerUp.score >= 0.5 && best.score - runnerUp.score < 0.1;
  const variant = resolveVariant(best.ref, specs, warnings);
  const specConflict = warnings.some((w) => w.includes("jamais proposé"));

  let status: Match["status"] = best.score >= 0.85 ? "matched" : best.score >= 0.5 ? "review" : "unmatched";
  if (status === "matched" && (close || specConflict)) status = "review";
  if (close) warnings.unshift(`Proche de ${runnerUp.ref.model}`);

  return {
    ref: status === "unmatched" ? undefined : best.ref,
    score: Math.round(best.score * 100) / 100,
    status,
    specs,
    variant: status === "unmatched" ? {} : variant,
    warnings,
    alternatives: ranked.slice(0, 5),
  };
}

/** Re-resolve a line after a user picks the model by hand. */
export function matchAgainst(line: RawLine, ref: RefModel): Match {
  const specs = parseSpecs(line);
  const warnings: string[] = [];
  const variant = resolveVariant(ref, specs, warnings);
  return { ref, score: 1, status: "matched", specs, variant, warnings, alternatives: [] };
}
