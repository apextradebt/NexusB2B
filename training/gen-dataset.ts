/**
 * Training data for the local matcher model (see README.md): supplier-style lines generated from the
 * catalogue, each with the candidates the app would send (candidatesFor) and the right answer.
 *
 *   npx tsx training/gen-dataset.ts [variantsPerModel=24] [seed=2026]
 *
 * Writes training/data/{train,valid,test-seen,test-unseen}.jsonl. "test-unseen" holds models kept out of
 * training altogether, to check the model also handles catalogue entries added later.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CATALOG, OTHER_DEVICES, phoneStorage } from "@/lib/catalog";
import { candidatesFor } from "@/lib/aiMatch";
import { matchLine } from "@/lib/match";
import type { RefModel } from "@/types";
import { SYSTEM, buildPrompt } from "./format";

const VARIANTS = Number(process.argv[2]) || 24;
let seed = Number(process.argv[3]) || 2026;
// mulberry32: the same seed gives the same data.
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (p: number) => rand() < p;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------------------------
// How suppliers write model names

const FAMILY: [RegExp, string[]][] = [
  [/MacBook Pro/, ["MBP", "Macbook Pro", "MacBookPro", "MACBOOK PRO", "Apple MacBook Pro"]],
  [/MacBook Air/, ["MBA", "Macbook Air", "MacBookAir", "MACBOOK AIR", "Apple MacBook Air"]],
  [/ThinkPad/, ["TP", "Thinkpad", "THINKPAD", "Think Pad", "Lenovo ThinkPad"]],
  [/EliteBook/, ["EB", "Elitebook", "ELITEBOOK", "Elite Book", "HP EliteBook"]],
  [/ProBook/, ["PB", "Probook", "PROBOOK", "HP ProBook"]],
  [/ZBook/, ["ZB", "Zbook", "ZBOOK"]],
  [/Latitude/, ["Lat", "Lat.", "LATITUDE", "Latitud", "Dell Lat"]],
  [/Precision/, ["Prec.", "PRECISION"]],
  [/LIFEBOOK/, ["Lifebook", "LifeBook", "Fujitsu Lifebook"]],
  [/Galaxy S(?=\d)/, ["SGS", "S", "Galaxy S", "GALAXY S", "Samsung S"]],
  [/Galaxy A(?=\d)/, ["A", "Galaxy A", "SM-A Galaxy A", "Samsung A"]],
  [/Galaxy Note ?/, ["Note ", "Galaxy Note ", "Note"]],
  [/Galaxy Z /, ["Z ", "Galaxy Z", "Samsung Z "]],
  [/iPhone/, ["IPHONE", "Iphone", "iphone", "Apple iPhone", "IP"]],
  [/Pixel/, ["PIXEL", "Google Pixel", "Pixel"]],
  [/Redmi Note/, ["Redmi Note", "REDMI NOTE", "Note"]],
  [/Surface Pro/, ["Surface Pro", "SURFACE PRO", "MS Surface Pro"]],
  [/Surface Laptop/, ["Surface Laptop", "Surface Laptop"]],
];

/** "Gen 2" / "G8" written the many ways suppliers do. */
function generation(s: string): string {
  return s
    .replace(/\bGen (\d+)\b/, (_, n) => pick([`Gen ${n}`, `G${n}`, `Gen${n}`, `${ordinal(n)} Gen`, `Gen.${n}`, `(Gen ${n})`, `${n}. Gen`, `Gen ${n}`]))
    .replace(/\bG(\d+)\b/, (_, n) => pick([`G${n}`, `G${n}`, `G ${n}`, `Gen ${n}`, `g${n}`]));
}
const ordinal = (n: string) => `${n}${n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th"}`;

/** One typo in a word without digits: swap, drop or double a letter. */
function typo(s: string): string {
  const words = s.split(" ");
  const idx = words.map((w, i) => (w.length >= 5 && !/\d/.test(w) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return s;
  const i = pick(idx);
  const w = words[i];
  const k = 1 + Math.floor(rand() * (w.length - 2));
  words[i] = pick([
    w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2),
    w.slice(0, k) + w.slice(k + 1),
    w.slice(0, k) + w[k] + w.slice(k),
  ]);
  return words.join(" ");
}

/** The model name as a supplier may write it. */
function nameOf(ref: RefModel): string {
  let name = ref.model;
  const fam = FAMILY.find(([rx]) => rx.test(name));
  if (fam && chance(0.55)) name = name.replace(fam[0], pick(fam[1]));
  // Laptop generations only: the "G" of a Moto G7 is part of the name.
  if (ref.category === "laptop") name = generation(name);
  if (chance(0.3)) name = name.replace(/\+/g, pick([" Plus", "Plus", "+"])).replace(/ Plus\b/, pick([" Plus", "+", " plus"]));
  // Apple names: "MacBook Pro 13 M1 2020" → "MacBook Pro M1 13\" (2020)", "… Late 2020"…
  if (ref.brand === "Apple" && ref.category === "laptop" && chance(0.5)) {
    name = name
      .replace(/\b(1[3-6](?:\.\d)?|2[1-7](?:\.5)?)\b(?!\d)/, (m) => pick([m, `${m}"`, `${m}-inch`, `${m} pouces`, `${m}''`]))
      .replace(/\b(20\d\d)\b/, (y) => pick([y, `(${y})`, `${pick(["Late", "Mid", "Early"])} ${y}`, y]));
  }
  // Glued numbers: "840 G5" → "840G5", "iPhone 12" → "iPhone12", "Pro 7" → "Pro7".
  if (chance(0.25)) name = name.replace(/([A-Za-z0-9]) (\d+[a-z]?\b)/, "$1$2");
  if (chance(0.15)) name = name.replace(/ (G\d+|Gen ?\d+)\b/, "$1");
  if (chance(0.2)) name = typo(name);
  if (chance(0.12)) name = name.toUpperCase();
  else if (chance(0.08)) name = name.toLowerCase();
  // Brand: often there, sometimes as a long form, sometimes left out.
  const brands: Record<string, string[]> = { HP: ["HP", "Hewlett-Packard", "Hewlett Packard"], Apple: ["Apple"], Samsung: ["Samsung", "SAMSUNG"], Lenovo: ["Lenovo", "LENOVO"], Dell: ["Dell", "DELL"] };
  if (!name.toLowerCase().includes(ref.brand.toLowerCase()) && chance(0.6)) name = `${pick(brands[ref.brand] ?? [ref.brand])} ${name}`;
  return name;
}

// ---------------------------------------------------------------------------------------------
// Configuration, condition, quantity, price: what surrounds the name on a line

const cpuText = (cpu: string) =>
  pick([cpu, cpu, `Intel Core ${cpu.replace("-", " ")}`, `Core ${cpu}`, cpu.replace(/^(i\d)-(\d+)/, "$1 $2"), cpu.slice(0, 2), `${cpu.slice(0, 2)} ${cpu.match(/-(\d{1,2})\d{2,3}/)?.[1] ?? "8"}th Gen`]);
const capText = (gb: string, kind: "ram" | "ssd") => {
  const n = gb.replace(/GB|TB| .*/g, "");
  const unit = /TB/.test(gb) ? pick(["TB", "To", "T"]) : pick(["GB", "Go", "G", "GB", " GB", " Go"]);
  const v = `${n}${unit}`;
  return kind === "ram" ? pick([v, `${v} RAM`, `RAM ${v}`, `${v} DDR4`]) : pick([v, `${v} SSD`, `SSD ${v}`, `${v} NVMe`, `${v} M.2`]);
};
const COLORS = ["Black", "Noir", "Midnight", "Graphite", "Blue", "Bleu", "White", "Blanc", "Silver", "Argent", "Gold", "Space Grey", "Gris sidéral", "Green", "Red"];
const GRADES = ["Grade A", "Grade B", "Grade C", "Class A", "Classe B", "Grade A+", "Très bon état", "Bon état", "B", "A-", "Grade B (rayures)"];
const EXTRAS_LAPTOP = ["AZERTY", "QWERTY UK", "FR", "W11P", "Win 10 Pro", "Windows 11 Pro", "FHD", "14\"", "15.6\"", "Touch", "Notebook", "Laptop", "Ordinateur portable", "sans chargeur", "Webcam"];
const EXTRAS_PHONE = ["5G", "Dual SIM", "Unlocked", "Débloqué", "Reconditionné", "Smartphone", "SM", "batterie 89%", "sans boîte", "eSIM"];

function lineOf(ref: RefModel): string {
  const parts: string[] = [nameOf(ref)];
  if (ref.category === "laptop") {
    const cpu = ref.cpu?.length ? pick(ref.cpu) : undefined;
    const ram = ref.ram?.length ? pick(ref.ram) : undefined;
    const ssd = ref.storage?.length ? pick(ref.storage) : undefined;
    if (cpu && ram && ssd && chance(0.25)) parts.push(`${cpu.match(/^i\d|^Ryzen \d|^M\d/)?.[0] ?? cpu}/${ram.replace("GB", "")}/${ssd.replace(/GB.*| .*/, "")}`);
    else {
      if (cpu && chance(0.75)) parts.push(cpuText(cpu));
      if (ram && chance(0.7)) parts.push(capText(ram, "ram"));
      if (ssd && chance(0.7)) parts.push(capText(ssd, "ssd"));
    }
    if (chance(0.35)) parts.push(pick(EXTRAS_LAPTOP));
  } else {
    if (chance(0.8)) parts.push(capText(pick(phoneStorage(ref)), "ram").replace(/ ?(RAM|DDR4)/, "").trim());
    if (chance(0.35)) parts.push(pick(COLORS));
    if (chance(0.3)) parts.push(pick(EXTRAS_PHONE));
  }
  if (chance(0.3)) parts.push(pick(GRADES));
  if (chance(0.12)) parts.push(pick(["x2", "3x", "5 pcs", "qty 4", "x10"]));
  if (chance(0.1)) parts.push(pick(["349€", "1 299,00 EUR", "€ 899", "420 € HT"]));
  // The name usually leads; sometimes the configuration or the grade comes first.
  const ordered = chance(0.12) ? [...parts.slice(1, 2), parts[0], ...parts.slice(2)] : parts;
  return ordered.join(pick([" ", " ", " ", " - ", " | ", ", ", " / "]));
}

// Lines that name no device the quotes cover: accessories, spare parts, headings, tablets and watches.
const NOT_DEVICES = [
  "Chargeur USB-C 65W", "Chargeur MacBook Pro 61W", "Adaptateur secteur HP 45W", "Dell WD19 Dock", "Station d'accueil Lenovo ThinkPad USB-C Dock Gen 2",
  "Écran Dell P2419H", "Ecran HP E24 G4", "Sacoche 15.6\"", "Souris Logitech M185", "Clavier HP 125", "Batterie iPhone 12", "Coque iPhone 13 Pro",
  "Câble Lightning", "Câble USB-C 1m", "Total", "Sous-total", "TOTAL GENERAL", "Lot n°12", "LAPTOPS", "Smartphones", "Disque dur 1TB", "Barrette RAM 8GB DDR4",
  "SSD 512GB NVMe", "Écran de remplacement Galaxy S21", "Vitre arrière iPhone 14", "Kit écouteurs", "AirPods Pro 2", "Galaxy Buds2", "Imprimante HP LaserJet",
  "Housse Surface Pro", "Stylet Surface Pen", "Pièces détachées Latitude 5420", "Carte mère ThinkPad T480", "Clavier MacBook Air M1 AZERTY",
];

// ---------------------------------------------------------------------------------------------
// Examples

type Example = { messages: { role: string; content: string }[]; meta: { ref?: string; text: string; rules?: string; rulesStatus: string; kind: string; dropped?: boolean } };

/** An example for a line: candidates as the app computes them; `answer` is the model the line names (if any). */
function example(text: string, answer: RefModel | undefined, kind: string, dropAnswer = false): Example | null {
  let cands = candidatesFor(text);
  if (dropAnswer && answer) cands = cands.filter((c) => c.id !== answer.id);
  if (cands.length === 0) return null; // the app would not ask
  if (chance(0.4)) cands = shuffle(cands);
  const at = answer ? cands.findIndex((c) => c.id === answer.id) : -1;
  const m = matchLine({ row: 0, text, quantity: 1 });
  return {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildPrompt(text, cands.map((c) => `${c.brand} ${c.model}`)) },
      { role: "assistant", content: String(at + 1) },
    ],
    meta: { ref: at >= 0 ? answer!.id : undefined, text, rules: m.ref?.id, rulesStatus: m.status, kind, dropped: dropAnswer || undefined },
  };
}

/** Lines the rules settle alone are rare at inference: keep a third of them. */
const keep = (e: Example | null): e is Example => !!e && (e.meta.rulesStatus !== "matched" || chance(0.33));

const unseen = new Set(shuffle(CATALOG.map((r) => r.id)).slice(0, Math.round(CATALOG.length * 0.08)));
const out: Record<string, Example[]> = { train: [], valid: [], "test-seen": [], "test-unseen": [] };

for (const ref of CATALOG) {
  for (let v = 0; v < VARIANTS; v++) {
    const text = lineOf(ref);
    // One line in six: the model is not in the catalogue (dropped from the candidates), the answer is 0.
    const e = example(text, ref, "device", chance(1 / 6));
    if (!keep(e)) continue;
    if (unseen.has(ref.id)) out["test-unseen"].push(e);
    else {
      const r = rand();
      out[r < 0.9 ? "train" : r < 0.95 ? "valid" : "test-seen"].push(e);
    }
  }
}
for (const ref of OTHER_DEVICES) {
  for (let v = 0; v < 4; v++) {
    const e = example(lineOf({ ...ref, category: "phone" }), undefined, "tablet-watch");
    if (e) out[chance(0.85) ? "train" : "test-seen"].push(e);
  }
}
for (const t of NOT_DEVICES) {
  for (let v = 0; v < 6; v++) {
    const text = v === 0 ? t : chance(0.5) ? t.toUpperCase() : `${t} ${pick(["x2", "- Grade B", "neuf", "(lot)", "Réf. 4471"])}`;
    const e = example(text, undefined, "not-device");
    if (e) out[chance(0.85) ? "train" : "test-seen"].push(e);
  }
}

mkdirSync("training/data", { recursive: true });
for (const [name, rows] of Object.entries(out)) {
  const data = name === "train" ? shuffle(rows) : rows;
  writeFileSync(`training/data/${name}.jsonl`, data.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const none = rows.filter((e) => e.messages[2].content === "0").length;
  const ruled = rows.filter((e) => e.meta.rulesStatus === "matched").length;
  // Device lines whose model was left in the candidates: how often the search found it at all.
  const offered = rows.filter((e) => e.meta.kind === "device" && !e.meta.dropped);
  const recall = offered.filter((e) => e.meta.ref).length / Math.max(1, offered.length);
  console.log(`${name.padEnd(12)} ${String(rows.length).padStart(6)} examples · answer 0: ${Math.round((100 * none) / rows.length)} % · rules already sure: ${Math.round((100 * ruled) / rows.length)} % · right model among candidates: ${(100 * recall).toFixed(1)} %`);
}
