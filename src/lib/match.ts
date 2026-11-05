import type { Match, ParsedSpecs, QuoteLine, RawLine, RefModel } from "@/types";
import { byCapacity, CATALOG, phoneStorage } from "@/lib/catalog";

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
    // Apple part numbers ("MTV13 ZD/A", "MK2K3FD/A") name a region SKU; their digits are no model number.
    .replace(/\b[a-z0-9]{4,5}\s?[a-z]{1,2}\/a\b/g, " ")
    // Mac model identifiers ("MacBookPro15,2"): the line, not a 15-inch model.
    .replace(/\b(macbook|imac)(pro|air)?\d{1,2},\d{1,2}\b/g, "$1 $2")
    // "GSM+CDMA", "Wi-Fi + Cellular" join two networks; only "S21+", "Note 10+" mean Plus.
    .replace(/\b(wi-?fi|wlan|gsm|cdma|lte|umts|[345]g)\s*\+\s*(?=cellular|cdma|gsm|lte|umts|[345]g\b)/g, "$1 ")
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
// Devices quotes do not cover: "Apple Watch Series 7" is no iPhone 7.
const OTHER_KINDS = new Set(["watch", "montre", "airpods", "buds", "earbuds", "ecouteurs", "pencil", "stylus", "playstation", "ps4", "ps5", "xbox", "nintendo", "console", "tv", "television", "kindle", "gopro", "drone", "printer", "imprimante", "monitor", "moniteur"]);
// Words a tablet's name carries: "Galaxy Tab S7" is no Galaxy S7, "iPad Pro 11" no MacBook Pro.
const TABLET_NAMES = new Set(["ipad", "tab"]);
const TABLET_WORDS = new Set([...TABLET_NAMES, "tablet", "tablette"]);
// A computer's line: "MacBook Pro … 16GB" is no iPhone 16 Pro.
const COMPUTER_NAMES = new Set(["macbook", "imac", "thinkpad", "latitude", "elitebook", "probook", "zbook", "lifebook", "chromebook"]);
const MAIN_BRANDS = new Set(["Apple", "Samsung"]);
// A maker's second line: a "Xiaomi Redmi 12" is no "Xiaomi 12".
const SUB_BRANDS = new Set(["redmi", "poco"]);
// A maker's product lines: a "ThinkBook 15 G2" is no "ThinkPad L15 Gen 2", an "EliteBook" no "ProBook".
const PRODUCT_LINES = new Set([
  "thinkpad", "thinkbook", "ideapad", "legion", "yoga", "latitude", "precision", "vostro", "inspiron", "xps",
  "elitebook", "probook", "zbook", "pavilion", "envy", "spectre", "lifebook", "celsius", "travelmate", "aspire", "swift",
  "expertbook", "vivobook", "zenbook",
]);

const isYear = (t: string) => /^20[0-3]\d$/.test(t);
// Tokens with a digit identify the model ("5420", "g8", "s23"); a release year only helps tell siblings apart.
const isKey = (t: string) => /\d/.test(t) && !isYear(t);
const weight = (t: string) => (isKey(t) ? 3 : isYear(t) ? 1 : LINE_WORDS.has(t) ? 0.5 : 1);

type Indexed = { ref: RefModel; toks: string[]; brand: string };
// One entry per name of a model: its own and the ones suppliers use ("iPad 9th Gen").
const INDEX: Indexed[] = CATALOG.flatMap((ref) => [ref.model, ...(ref.aliases ?? [])].map((name) => ({
  ref,
  // Brand is scored separately so "HP" or "Dell" missing from a line does not sink the score.
  toks: tokens(name).filter((t) => !NOISE.has(t)),
  brand: normalize(ref.brand),
})));

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
  // Traders' "IP13PM", "IP13P": Pro Max and Pro.
  [/\bip ?(x[rs]?|[4-9]|1\d) ?pm\b/g, "iphone $1 pro max"],
  [/\bip ?(x[rs]?|[4-9]|1\d) ?p\b/g, "iphone $1 pro"],
  [/\bip ?([4-9]|1\d)\b/g, "iphone $1"],
];

// Samsung's model codes ("SM-G991B/DS"), which wholesale lists often give instead of the name.
const SAMSUNG_CODES: Record<string, string> = {
  g950: "s8", g955: "s8 plus", g960: "s9", g965: "s9 plus", g970: "s10e", g973: "s10", g975: "s10 plus",
  g980: "s20", g981: "s20", g985: "s20 plus", g986: "s20 plus", g988: "s20 ultra", g780: "s20 fe", g781: "s20 fe",
  g990: "s21 fe", g991: "s21", g996: "s21 plus", g998: "s21 ultra", s901: "s22", s906: "s22 plus", s908: "s22 ultra",
  s711: "s23 fe", s911: "s23", s916: "s23 plus", s918: "s23 ultra", s721: "s24 fe", s921: "s24", s926: "s24 plus", s928: "s24 ultra",
  s931: "s25", s936: "s25 plus", s938: "s25 ultra", n970: "note 10", n975: "note 10 plus", n980: "note 20", n981: "note 20", n985: "note 20 ultra", n986: "note 20 ultra",
  f711: "z flip 3", f721: "z flip 4", f731: "z flip 5", f741: "z flip 6", f926: "z fold 3", f936: "z fold 4", f946: "z fold 5", f956: "z fold 6",
  a125: "a12", a127: "a12", a135: "a13", a145: "a14", a146: "a14", a156: "a15", a256: "a25", a326: "a32", a336: "a33", a346: "a34", a356: "a35",
  a515: "a51", a516: "a51", a525: "a52", a526: "a52", a528: "a52s", a536: "a53", a546: "a54", a556: "a55", a715: "a71", a716: "a71",
};
const samsungCodes = (s: string) => s.replace(/\bsm ([a-z]\d{3})[a-z0-9]*\b/g, (m, code) => (SAMSUNG_CODES[code] ? `galaxy ${SAMSUNG_CODES[code]}` : m));

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
  return wordsOf(stripSpecs(text));
}

function wordsOf(text: string): string[] {
  const words = reglue(tokens(text).flatMap(unglue).map(spellCheck)).join(" ");
  return samsungCodes(SHORTHAND.reduce((s, [rx, to]) => s.replace(rx, to), words)).split(" ").filter((t) => t && !NOISE.has(t));
}

// Sizes a line gives as bare numbers (RAM, storage): not a sign of another model.
const CAPACITY = /^(?:4|6|8|12|16|18|24|32|36|48|64|96|128|256|512|1000|1024|2048)$/;
// A part or an accessory for the model, not the model itself.
const PARTS = new Set(["carte", "mere", "motherboard", "clavier", "keyboard", "coque", "case", "housse", "sleeve", "sacoche", "chargeur", "charger", "adaptateur", "adapter", "dock", "station", "batterie", "battery", "ecran", "screen", "display", "stylet", "pen", "cable", "piece", "pieces", "parts", "verre", "film"]);

/**
 * The line names this model and no other: every word of its name is there (the brand and the year may
 * be left out), and no other catalogue word is ("MacBook Air 15 M3 16GB 512GB" names "MacBook Air 15 M3
 * 2024"; "EliteBook x360 1040 G6" does not name "EliteBook 1040 G6", nor "iPhone 13 Pro Max" "iPhone 13 Pro").
 * The words are read before the configuration is taken out: in "Pixel 2 / 64GB" the 2 is the model's.
 * Expects a text without its grade and quantity ("Grade A+" would read as a Plus).
 */
export function namesExactly(text: string, ref: RefModel): boolean {
  const brand = normalize(ref.brand);
  const line = new Set(wordsOf(text.replace(CPU_NAMES, " ")));
  for (const t of line) if (PARTS.has(t)) return false;
  const names = [ref.model, ...(ref.aliases ?? [])].map((model) => new Set(normalize(`${ref.brand} ${model}`).split(" ")));
  // Words of the model's other names are no other model's ("ThinkBook 14 G1" is also the "14 IIL").
  const own = new Set(names.flatMap((n) => [...n]));
  return names.some((name) => {
    for (const t of name) if (t !== brand && !/^20\d\d$/.test(t) && !line.has(t)) return false;
    for (const t of line) if (!own.has(t) && VOCAB.has(t) && !CAPACITY.test(t) && !/^(?:i[3579]|[345]g)$/.test(t)) return false;
    return true;
  });
}

/** Line and model each name a product line the other lacks ("ThinkPad X1 Yoga" still answers to "Yoga"). */
export function otherLine(input: Set<string>, modelToks: string[]): boolean {
  const lines = modelToks.filter((t) => PRODUCT_LINES.has(t));
  return lines.length > 0 && [...input].some((t) => PRODUCT_LINES.has(t) && !lines.includes(t)) && !lines.some((t) => input.has(t));
}

/** Score one catalog model against a line's tokens (0–1). */
function scoreRef(ix: Indexed, input: Set<string>, brandHint?: string): number {
  for (const t of input) if (OTHER_KINDS.has(t) && !ix.toks.includes(t)) return 0;
  // A tablet's word ("iPad", "Tab") on one side only: a tablet and a phone or a laptop. "Tablette" rules out phones.
  for (const t of input) if (TABLET_NAMES.has(t) && !ix.toks.includes(t)) return 0;
  const saysTablet = [...input].some((t) => TABLET_WORDS.has(t));
  if (!saysTablet && ix.toks.some((t) => TABLET_NAMES.has(t))) return 0;
  if (saysTablet && ix.ref.category === "phone") return 0;
  if (ix.ref.category !== "laptop" && [...input].some((t) => COMPUTER_NAMES.has(t))) return 0;
  for (const t of input) if (SUB_BRANDS.has(t) && !ix.toks.includes(t)) return 0;
  if (otherLine(input, ix.toks)) return 0;
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
  // A bare number is all that fits ("Dock 5" against "Pixel 5"): no line word, no maker, not enough to be sure.
  if (ix.toks.every((t) => !input.has(t) || /^\d+$/.test(t)) && !input.has(ix.brand)) score = Math.min(score, 0.6);

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
    if (named.length && !named.includes(ix.brand)) score -= 0.6;
  }
  return Math.max(0, score);
}

const up = (s: string) => s.toUpperCase();
const RAM_OK = (n: number) => [2, 3, 4, 6, 8, 12, 16, 18, 20, 24, 32, 36, 40, 48, 64, 96, 128, 192].includes(n);

/**
 * A bare "T" is terabytes only for 1/2/4 ("1T"): "Xiaomi 13T" or "OnePlus 8T" are model names. And only
 * when the line gives no storage in gigabytes: in "OnePlus Nord 2T 128GB" the 2T is the model's.
 */
const BARE_T_OK = (text: string) => !/\b(?:3[2-9]|[4-9]\d|\d{3,4})\s?(?:gb|go|g)\b(?!\s*(?:de\s*)?(?:ram|ddr|lpddr|memory|m[eé]moire))/i.test(text);

// Laptop CPU names: "i5-1035G1" is no "G1" generation, "Ryzen 5 5500U" no model 5500.
const CPU_NAMES = new RegExp([
  /\b(?:intel\s*)?(?:core\s*)?i[3579][\s-]*\d{4,5}[a-z]{0,2}\d?\b/,
  /\b(?:intel\s*)?core\s*ultra\s*[579]\s*\d{3}[a-z]\b/,
  /\b(?:amd\s*)?ryzen\s*[3579]\s*(?:pro\s*)?\d{4}[a-z]{1,2}\b/,
  /\b(?:celeron|pentium(?:\s+(?:silver|gold))?)\s*n?\d{4}[a-z]?\b/,
].map((r) => r.source).join("|"), "gi");

// "16/512", "8GB/256GB". The start of "6.2 / 64GB" is a model number, never a RAM size.
const RAM_SLASH_STORAGE = /(?<![\d.])\b(\d{1,2})(\s?(?:gb|go|g))?(\s*)\/(\s*)(\d{1,4})(\s?(?:gb|go|g|tb|to|t))?\b/gi;
// "Galaxy Z Fold 6 / 512GB / Black": a slash between the fields of a list, the 6 belongs to the model.
const listSlash = (ramUnit: string | undefined, before: string, after: string, unit: string | undefined) => !ramUnit && !!before && !!after && !!unit;

/**
 * Remove configuration fragments (CPU, RAM, storage, "16/512") so their numbers do not
 * pass for model numbers ("MacBook Air M1 8/256" is not an iPhone 8).
 */
export function stripSpecs(text: string): string {
  const bareT = BARE_T_OK(text) ? "|[124]\\s?t" : "";
  return ` ${text.replace(/_/g, " ")} `
    // "EliteBook 840 G 6": the generation, not an "840 G" capacity.
    .replace(/\b(\d{3,4}) ?g (\d{1,2})\b/gi, "$1 g$2")
    .replace(RAM_SLASH_STORAGE, (m, ram, ramUnit, before, after, _storage, unit) => (listSlash(ramUnit, before, after, unit) ? `${ram} ` : " "))
    .replace(new RegExp(`\\b(?:\\d{1,4}\\s?(?:gb|go|g|tb|to)${bareT})\\b(\\s*(?:ssd|hdd|nvme|emmc|ram|ddr\\d?|lpddr\\d?x?|m\\.2|pcie))?`, "gi"), " ")
    .replace(/\b(?:\d{3,4}|[124])\s?(?:ssd|hdd|nvme|emmc)\b/gi, " ")
    // "M2 Pro" / "M1 Ultra" name the chip, not a "Pro" or "Ultra" model; the "M2" stays ("MacBook Air M2").
    .replace(/\b(m[1-5])\s+(?:pro|max|ultra)\b/gi, "$1")
    .replace(CPU_NAMES, " ")
    // Phone and tablet chips: "Snapdragon 8 Gen 1" is no 1st generation, "Dimensity 8200-Ultra" no Ultra,
    // "A15 Bionic" no Galaxy A15. Apple's "A12" counts as a chip only when "Bionic" or "Apple" says so.
    .replace(/\b(?:qualcomm\s*)?snapdragon\s*(?:\d{3}\+?|\d\+?(?:\s*gen\s*\d)?(?:\s*elite)?)(?:\s*for\s*galaxy)?(?=\s|$)/gi, " ")
    .replace(/\b(?:mediatek\s*)?(?:dimensity\s*\d{3,4}(?:[\s-]*(?:ultra|plus|\+))?|helio\s*[a-z]\d{2,3})(?=\s|$)/gi, " ")
    .replace(/\b(?:unisoc\s*[a-z]?\d{3,4}|exynos\s*\d{3,4}|kirin\s*\d{3,4}|(?:google\s*)?tensor\s*g\d)\b/gi, " ")
    .replace(/\b(?:apple\s*)?a\d{1,2}[xz]?(?:\s*(?:pro|fusion))?\s*bionic\b|\bapple\s*a\d{1,2}[xz]?(?:\s*(?:pro|fusion))?\b/gi, " ")
    .replace(/\b(?:mediatek|qualcomm|bionic)\b/gi, " ")
    // "Core" alone is Intel's; "Core-X5" is a Crosscall.
    .replace(/\b(?:ssd|hdd|nvme|emmc|ram|ddr\d?|lpddr\d?x?|intel|amd|core(?![- ][xmz]\d)|win(?:dows)?\s*1[01](?:\s*pro)?|azerty|qwerty|qwertz|french|fr|uk|us|de)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TB_IN_GB: Record<string, number> = { 1000: 1, 1024: 1, 2000: 2, 2048: 2, 4000: 4, 4096: 4, 8000: 8, 8192: 8 };

/** Pull CPU / RAM / storage out of free text. Explicit spec columns are tried first by the caller. */
export function parseSpecs(line: Pick<RawLine, "text" | "cpu" | "ram" | "storage">): ParsedSpecs {
  const specs: ParsedSpecs = {};
  let txt = ` ${line.text.replace(/_/g, " ")} `.toLowerCase();
  const cpuTxt = (line.cpu || txt).toLowerCase();

  // Desktop chips have no suffix ("i5-10500"), but "i5 2019" is a year.
  const intel = cpuTxt.match(/\b(i[3579])[\s-]*(?!20[0-3]\d\b)(\d{4,5}[a-z]{0,2}\d?)\b/);
  const ryzen = cpuTxt.match(/ryzen\s*([3579])\s*(pro\s*)?(\d{4}[a-z]{1,2})\b/);
  const low = cpuTxt.match(/\b(celeron|pentium(?:\s+(?:silver|gold))?)\s*(n?\d{4}[a-z]?)\b/);
  const ultra = cpuTxt.match(/\bultra\s*([579])\s*(\d{3}[a-z])\b/);
  // "Mac mini M2 2023 Apple M2 Pro": the fullest name of the chip, not the model's "M2".
  const chips = [...cpuTxt.matchAll(/\b(?:apple\s+)?m([1-5])(?:\s+(pro|max|ultra))?\b(?!\.\d)/g)];
  const apple = chips.find((c) => c[2]) ?? chips[0];
  if (ultra) specs.cpu = `Core Ultra ${ultra[1]} ${up(ultra[2])}`;
  else if (apple && /apple|mac|\bm[1-5]\b/.test(cpuTxt) && !/m\.2/.test(cpuTxt.slice(apple.index!, apple.index! + 4))) specs.cpu = `Apple M${apple[1]}${apple[2] ? " " + apple[2][0].toUpperCase() + apple[2].slice(1) : ""}`;
  else if (intel) specs.cpu = `${intel[1]}-${up(intel[2])}`;
  else if (ryzen) specs.cpu = `Ryzen ${ryzen[1]} ${ryzen[2] ? "PRO " : ""}${up(ryzen[3])}`;
  else if (low) specs.cpu = `${low[1].replace(/\b\w/g, (c) => c.toUpperCase())} ${up(low[2])}`;
  const tier = cpuTxt.match(/\b(i[3579]|ryzen\s*[3579])\b/);
  if (tier) specs.cpuTier = tier[1].replace(/\s+/, " ");

  // 1000GB and 1024GB are how tools write 1TB.
  const gb = (n: string, unit: string) => (/^t/i.test(unit) ? `${n}TB` : TB_IN_GB[n] ? `${TB_IN_GB[n]}TB` : `${n}GB`);
  // "16/512", "8GB/256GB", "i5/16/256": RAM then storage.
  const slash = txt.match(/(?<![\d.])\b(\d{1,2})(\s?(?:gb|go|g))?(\s*)\/(\s*)(\d{2,4}|[12]|[48](?=\s?t))\s?(gb|go|g|tb|to|t)?\b/);
  if (slash && !listSlash(slash[2], slash[3], slash[4], slash[6]) && RAM_OK(Number(slash[1])) && (slash[6] ? true : Number(slash[5]) >= 64 || Number(slash[5]) <= 2)) {
    if (!line.ram) specs.ram = `${slash[1]}GB`;
    if (!line.storage) specs.storage = gb(slash[5], slash[6] || (Number(slash[5]) <= 2 ? "tb" : "gb"));
  }
  if (line.ram) {
    const m = line.ram.match(/(\d{1,3})/);
    if (m) specs.ram = `${m[1]}GB`;
  } else if (!specs.ram) {
    const m = txt.match(/\b(\d{1,3})\s?(?:gb|go|g)\s*(?:de\s*)?(?:ram|ddr\d?|lpddr\d?x?|memory|memoire|mémoire)\b/) || txt.match(/\b(?:ram|memory|memoire|mémoire)\s*:?\s*(\d{1,3})\s?(?:gb|go|g)\b/);
    if (m) {
      specs.ram = `${m[1]}GB`;
      // "RAM 16GB SSD 1TB": the 16GB is spoken for, not a "16GB SSD".
      txt = txt.replace(m[0], " ");
    }
  }

  if (line.storage) {
    const m = line.storage.match(/(\d{1,4})\s?(gb|go|tb|to)?/i);
    if (m) specs.storage = gb(m[1], m[2] || (Number(m[1]) <= 4 ? "tb" : "gb"));
  } else if (!specs.storage) {
    const m =
      txt.match(/\b(\d{1,4})\s?(gb|go|g|tb|to|t)\s*(?:de\s*)?(?:ssd|nvme|emmc|hdd|m\.2|pcie|storage|stockage)\b/) ||
      txt.match(/\b(?:ssd|nvme|hdd|storage|stockage)\s*:?\s*(\d{1,4})\s?(gb|go|g|tb|to|t)\b/) ||
      // "256ssd", "512 SSD": no unit, but the drive type says it is storage (1-4 = TB).
      txt.match(/\b(\d{3,4}|[124])()\s?(?:ssd|nvme|emmc|hdd)\b/);
    if (m) {
      specs.storage = gb(m[1], m[2] || (Number(m[1]) <= 4 ? "tb" : "gb"));
      // "i5 16GB 256GB SSD": storage is marked, so the remaining small capacity is the RAM.
      if (!specs.ram) {
        const rest = txt.replace(m[0], " ");
        const ram = [...rest.matchAll(/\b(\d{1,2})\s?(?:gb|go|g)\b/g)].map((x) => Number(x[1])).find((n) => n >= 4 && n <= 64);
        if (ram) specs.ram = `${ram}GB`;
      }
    } else {
      // A lone capacity ("iPhone 13 128GB") or two ("i5 16GB 256GB"): the large one is storage, the small one RAM.
      // "4G" / "5G" are the mobile network, not a capacity.
      const bareT = BARE_T_OK(txt);
      const caps = [...txt.matchAll(/\b(\d{1,4})\s?(gb|go|g|tb|to|t)\b/g)].filter((x) => !(x[2] === "g" && Number(x[1]) <= 5) && !(x[2] === "t" && (!bareT || ![1, 2, 4].includes(Number(x[1])))));
      const inGb = (x: RegExpExecArray | RegExpMatchArray) => Number(x[1]) * (/^t/i.test(x[2]) ? 1024 : 1);
      // "32GB 1TB": the largest of the two.
      const cap = caps.filter((x) => (/^t/i.test(x[2]) && Number(x[1]) <= 8) || Number(x[1]) >= 32).sort((a, b) => inGb(b) - inGb(a))[0];
      if (cap) {
        specs.storage = gb(cap[1], cap[2]);
        const ram = caps.find((x) => x !== cap && !/^t/i.test(x[2]) && RAM_OK(Number(x[1])) && Number(x[1]) < Number(cap[1]) * (/^t/i.test(cap[2]) ? 1024 : 1));
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
  if (specs.storage && (specs.ram || byCapacity(ref.category))) return specs;
  const own = new Set(tokens(ref.model));
  const bare = (s?: string) => (s ? tokens(stripSpecs(s)).filter((t) => /^\d{1,4}$/.test(t) && !own.has(t)).map(Number) : []);
  const nums = [...bare(line.text), ...bare(line.storage), ...bare(line.ram)];
  const storageOptions = byCapacity(ref.category) ? phoneStorage(ref) : ref.storage ?? [];
  const out = { ...specs };
  // "8Go 256": the RAM has its unit, the storage none, so parseSpecs could not tell them apart. "5G" is the network.
  const sized = (s?: string) => (s ? [...s.toLowerCase().replace(/_/g, " ").matchAll(/\b(\d{1,3})\s?(gb|go|g)\b/g)].filter((x) => !(x[2] === "g" && Number(x[1]) <= 5)).map((x) => Number(x[1])) : []);
  if (!out.storage) {
    // A phone's lone "16GB" is its storage: nothing else on the line could be.
    const hits = [...nums, ...(byCapacity(ref.category) ? sized(line.text) : [])].filter((n) => n >= 16 && storageOptions.some((s) => s.startsWith(`${n}GB`)));
    // Two different candidates ("64 128") say nothing for sure.
    if (new Set(hits).size === 1) out.storage = `${hits[0]}GB`;
  }
  if (ref.category === "laptop" && !out.ram && out.storage) {
    const cap = Number(out.storage.match(/^\d+/)![0]) * (/TB/.test(out.storage) ? 1024 : 1);
    const rams = [...nums, ...sized(line.text), ...sized(line.ram)].filter((n) => n < cap && RAM_OK(n) && (ref.ram ?? []).includes(`${n}GB`));
    if (new Set(rams).size === 1) out.ram = `${rams[0]}GB`;
  }
  return out;
}

/** The model's CPUs of a bare tier ("i5" → i5-10210U, i5-1135G7…). */
export const cpusOfTier = (cpus: string[] | undefined, tier: string) =>
  (cpus ?? []).filter((c) => normalize(c).replace(/\s/g, "").startsWith(tier.replace(/\s/g, "")));

/** Tier left open by the "CPU i5 ambigu" warning, if any. */
export const ambiguousCpuTier = (warnings: string[]) => warnings.map((w) => w.match(/^CPU (.+) ambigu\b/)?.[1]).find(Boolean);

/** Resolve parsed specs against the options the model was actually sold with. */
function resolveVariant(ref: RefModel, specs: ParsedSpecs, warnings: string[]) {
  const variant: Match["variant"] = {};
  if (byCapacity(ref.category)) {
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
    const same = cpusOfTier(ref.cpu, specs.cpuTier);
    if (same.length === 1) variant.cpu = same[0];
    else if (same.length > 1) warnings.push(`CPU ${specs.cpuTier} ambigu (${same.length} options)`);
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
  const words = modelTokens(line.text);
  const input = new Set(words);
  const specs = parseSpecs(line);
  // "Ecran iPhone 12", "Batterie iPhone 11": a part for the model, not the model.
  if (PARTS.has(words[0])) return { score: 0, status: "unmatched", specs, variant: {}, warnings: ["Aucun modèle du référentiel ne correspond"], alternatives: [] };
  const saysLaptop = /\blaptop\b/i.test(line.text);
  // The CPU pins down the generation when the name does not ("EliteBook 840" + i5-8265U → G6 only).
  const cpuFit = (ref: RefModel) => {
    if (!specs.cpu || ref.category !== "laptop" || !ref.cpu) return 0;
    return ref.cpu.some((c) => eqCpu(c, specs.cpu!)) ? 0.1 : -0.1;
  };
  const ranked = INDEX.map((ix) => {
    // "Laptop" is a noise word, but it tells a "Surface Go 2" from a "Surface Laptop Go 2".
    const base = scoreRef(ix, input, line.brand) - (!saysLaptop && /\blaptop\b/i.test(ix.ref.model) ? 0.15 : 0);
    // Model words present in the text, and whether all of them are (brand words don't count).
    const words = ix.toks.filter((t) => TEXT_BRANDS.get(t) !== ix.brand);
    const found = words.filter((t) => input.has(t)).length;
    return { ref: ix.ref, score: base > 0.3 ? Math.min(1, Math.max(0, base + cpuFit(ix.ref))) : base, found, full: found === words.length };
  })
    .filter((r) => r.score > 0.3)
    // A model under its best name only (its own or a supplier's: "iPad 10.2 (2021)" or "iPad 9th Gen").
    .sort((a, b) => b.score - a.score || b.found - a.found)
    .filter((r, i, all) => all.findIndex((x) => x.ref === r.ref) === i)
    // Ties go to the model with more of its words in the text ("Nord N10" over "OnePlus Nord", whose
    // "OnePlus" is only the brand), then to the more specific one ("iPhone 15 Pro Max" over "iPhone 15").
    .sort((a, b) => b.score - a.score || b.found - a.found || b.ref.model.length - a.ref.model.length);

  const warnings: string[] = [];
  // A bare "A54" is a Samsung and an Oppo: no maker named, two makers fit, so it is a close call, led by the wider seller.
  const noMaker = !line.brand && ![...input].some((t) => TEXT_BRANDS.has(t));
  const sharedName = noMaker && ranked.length > 1 && ranked[0].full && ranked[1].full && ranked[0].found === ranked[1].found && ranked[0].ref.brand !== ranked[1].ref.brand;
  if (sharedName && MAIN_BRANDS.has(ranked[1].ref.brand) && !MAIN_BRANDS.has(ranked[0].ref.brand)) ranked.unshift(ranked.splice(1, 1)[0]);
  const best = ranked[0];
  if (!best) return { score: 0, status: "unmatched", specs, variant: {}, warnings: ["Aucun modèle du référentiel ne correspond"], alternatives: [] };

  const runnerUp = ranked[1];
  // Not a close call when the text spells out every word of the best model and more of them than the
  // runner-up's ("Galaxy S25 Edge" vs "Galaxy S25", "Pixel 9 Pro XL" vs "Pixel 9 Pro").
  const spelledOut = !!runnerUp && best.full && (!runnerUp.full || best.found > runnerUp.found);
  const close = sharedName || (!!runnerUp && runnerUp.score >= 0.5 && best.score - runnerUp.score < 0.1 && !spelledOut);
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
