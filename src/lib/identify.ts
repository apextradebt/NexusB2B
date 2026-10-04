import { useEffect, useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { matchAgainst } from "@/lib/match";
import type { Match, QuoteLine, RawLine, RefModel } from "@/types";

// Same backend as the "Marché (Nexus API)" agent; the TAC database and the Apple, Lenovo
// and HP lookups live there (B2C-Backend/src/logic/deviceLookup.ts).
const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** An IMEI (only its 8-digit TAC is sent) or a serial number (Mac, Lenovo, HP or Fujitsu PC) typed in place of a model name. */
export type Identifier = { kind: "imei"; tac: string } | { kind: "serial"; serial: string };

/** A PC's factory configuration, as Lenovo, HP or Fujitsu record it: "i5-1135G7", "16GB", "256GB" or "1TB HDD", '14"', "FHD". */
export type PcSpecs = { cpu?: string; ram?: string; storage?: string; screen?: string; display?: string };

export type Identification =
  | { kind: "imei"; found: true; brand: string; model: string; details: string; ref?: RefModel }
  | { kind: "imei"; found: false; tac: string }
  | { kind: "serial"; found: true; brand: string; name: string; specs?: PcSpecs; ref?: RefModel }
  | { kind: "serial"; found: false; reason: "modern_serial" | "unknown_code" };

/**
 * "357474401234565", "35 747440 123456 5" (IMEI), "C02XK0AAJGH5", "PF2W2GLT" (serial, one word with
 * letters and digits) or the code scanned on a Lenovo label ("1S" + machine type and model + serial).
 */
export function identifierIn(text: string): Identifier | null {
  const digits = text.replace(/[\s-]/g, "");
  if (/^\d{15}$/.test(digits)) return { kind: "imei", tac: digits.slice(0, 8) };
  const word = text.trim().toUpperCase();
  const lenovoLabel = word.match(/^1S[A-Z0-9]{10}([A-Z0-9]{8})$/);
  if (lenovoLabel) return { kind: "serial", serial: lenovoLabel[1] };
  if (/^([A-Z0-9]{8}|[A-Z0-9]{10,13})$/.test(word) && /\d/.test(word) && /[A-Z]/.test(word)) return { kind: "serial", serial: word };
  return null;
}

export type SerialSource = "lenovo" | "hp" | "fujitsu" | "apple";

/**
 * Makers whose serial numbers have this length, in the order to ask them. Lenovo's have 8 characters,
 * HP's and Fujitsu's 10 like Apple's since 2021, Apple's older ones 11 or 12 (one more with the "S"
 * of a scanned barcode). Apple comes last: identifying a 2021+ Mac uses Macfax quota.
 */
export function serialSources(serial: string): SerialSource[] {
  if (serial.length === 8) return ["lenovo"];
  if (serial.length === 10) return ["hp", "fujitsu", "apple"];
  return ["apple"];
}

// "GALAXY A53 5G" (TAC database) = "Galaxy A53" (catalogue): the network or dual-SIM suffix of the
// TAC name is dropped in a second, looser pass. "+" is kept ("Galaxy S22+" is not "Galaxy S22").
const key = (s: string, loose = false) => {
  const lower = s.toLowerCase().replace(/\+/g, "plus");
  return (loose ? lower.replace(/\b(5g|4g|lte|ds)\b/g, "") : lower).replace(/[^a-z0-9]/g, "");
};
// The TAC database numbers iPhone SE generations, the catalogue dates them.
const TAC_ALIASES: [RegExp, string][] = [[/iphonese2ndgen$/, "iphonese2020"], [/iphonese3rdgen$/, "iphonese2022"]];

/** Catalogue phone for a TAC entry ("APPLE" + "IPHONE 13"). */
export function catalogPhone(brand: string, model: string, catalog: RefModel[] = CATALOG): RefModel | undefined {
  const phones = catalog.filter((r) => r.category === "phone");
  for (const loose of [false, true]) {
    // Some catalogue names include the brand ("Xiaomi 15 Ultra"), most don't ("Galaxy A34").
    const k = TAC_ALIASES.reduce((s, [from, to]) => s.replace(from, to), key(`${brand} ${model}`, loose));
    const hit = phones.find((r) => key(`${r.brand} ${r.model}`) === k || key(r.model) === k);
    if (hit) return hit;
  }
  return undefined;
}

const MAC_FAMILIES = ["MacBook Pro", "MacBook Air", "MacBook", "iMac Pro", "iMac", "Mac mini", "Mac Pro", "Mac Studio"];

/** Family, screen size, Apple chip and year of a Mac, from Apple's name or a catalogue name. */
function macSpecs(name: string) {
  const family = MAC_FAMILIES.find((f) => name.toLowerCase().startsWith(f.toLowerCase()));
  const rest = family ? name.slice(family.length) : name;
  return {
    family,
    size: rest.match(/\b(\d{2}(?:\.\d)?)(?:-inch|(?=\s|$))/)?.[1],
    chip: rest.match(/\bM\d\b/)?.[0],
    year: rest.match(/\b(20\d\d)\b/g)?.pop(),
  };
}

/**
 * Catalogue Mac for Apple's model name, e.g. "MacBook Pro (13-inch, 2019, Two Thunderbolt 3 ports)"
 * → "MacBook Pro 13 2019 Intel". Only a single, unambiguous candidate is returned.
 */
export function catalogMac(name: string, catalog: RefModel[] = CATALOG): RefModel | undefined {
  const mac = macSpecs(name);
  if (!mac.family || !mac.year) return undefined;
  const hits = catalog.filter((r) => {
    if (r.category !== "laptop" || r.brand !== "Apple") return false;
    const c = macSpecs(r.model);
    return c.family === mac.family && String(r.year ?? c.year) === mac.year
      && (!c.size || !mac.size || c.size === mac.size)
      && c.chip === mac.chip; // Intel models have no chip in either name
  });
  return hits.length === 1 ? hits[0] : undefined;
}

// "X1 Carbon 9th Gen" (Lenovo) = "X1 Carbon Gen 9" (catalogue).
const words = (s: string) => s.toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\s+gen\b/g, "gen $1").split(/[^a-z0-9]+/).filter(Boolean);
const isPrefix = (short: string[], long: string[]) => short.length <= long.length && short.every((w, i) => long[i] === w);

/**
 * Catalogue laptop for a PC named by Lenovo, HP or Fujitsu ("ThinkPad E14 Gen 2", "ZBook Firefly 14 G8 Mobile
 * Workstation" → "ZBook Firefly 14 G8"). Lenovo's product number starts with the machine type
 * ("20T7S0JW00" → 20T7), which catalogue entries list when they come from PSREF.
 */
export function catalogPc(brand: string, name: string, productNumber = "", catalog: RefModel[] = CATALOG): RefModel | undefined {
  const laptops = catalog.filter((r) => r.category === "laptop" && r.brand.toLowerCase() === brand.toLowerCase());
  const type = productNumber.slice(0, 4).toUpperCase();
  // "8th gen 20N2/20N3": the generation is not a machine type.
  const byType = laptops.filter((r) => r.machineTypes?.toUpperCase().match(/\b\d[0-9A-Z]{3}\b(?!\s*GEN)/g)?.includes(type));
  if (type.length === 4 && byType.length === 1) return byType[0];
  // The longest catalogue name the maker's name starts with, word for word ("840 G1" is not "840 G10").
  const target = words(name);
  const hits = laptops.filter((r) => isPrefix(words(r.model), target));
  const longest = Math.max(0, ...hits.map((r) => words(r.model).length));
  const best = hits.filter((r) => words(r.model).length === longest);
  return best.length === 1 ? best[0] : undefined;
}

/** The factory configuration a PC serial number gave, among the options the model was sold with. */
export function factoryVariant(ref: RefModel, id: Identification | null | undefined): QuoteLine["variant"] {
  const specs = id?.found && id.kind === "serial" ? id.specs : undefined;
  if (!specs || ref.category !== "laptop") return {};
  return matchAgainst({ row: 0, text: "", quantity: 1, cpu: specs.cpu, ram: specs.ram, storage: specs.storage }, ref).variant;
}

/** The catalogue model of an identified device, if any. */
export const refOf = (id: Identification | null | undefined) => (id?.found ? id.ref : undefined);

const SERIAL_PATHS: Record<SerialSource, (serial: string) => string> = {
  // Apple's English names (Macfax only has those for 2021+ Macs), which catalogMac understands.
  apple: (s) => `/api/lookup/apple-serial/${encodeURIComponent(s)}?lang=en`,
  lenovo: (s) => `/api/lookup/pc-serial/lenovo/${encodeURIComponent(s)}`,
  hp: (s) => `/api/lookup/pc-serial/hp/${encodeURIComponent(s)}`,
  fujitsu: (s) => `/api/lookup/pc-serial/fujitsu/${encodeURIComponent(s)}`,
};

async function identifyImei(tac: string): Promise<Identification | null> {
  const res = await fetch(`${API}/api/lookup/tac/${tac}`);
  if (res.status === 400) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.found
    ? { kind: "imei", found: true, brand: body.brand, model: body.model, details: body.details, ref: catalogPhone(body.brand, body.model) }
    : { kind: "imei", found: false, tac: body.tac };
}

/** Asks each maker the serial number may come from, in turn, until one knows it. */
async function identifySerial(serial: string, sources: SerialSource[]): Promise<Identification | null> {
  let failed = false;
  for (const source of sources) {
    const res = await fetch(`${API}${SERIAL_PATHS[source](serial)}`).catch(() => undefined);
    if (res?.status === 400) continue; // not this maker's format
    if (!res?.ok) {
      failed = true;
      continue;
    }
    const body = await res.json();
    if (body.found) {
      return source === "apple"
        ? { kind: "serial", found: true, brand: "Apple", name: body.name, ref: catalogMac(body.name) }
        : { kind: "serial", found: true, brand: body.brand, name: body.name, specs: body.specs, ref: catalogPc(body.brand, body.name, body.productNumber) };
    }
    // Apple says why it couldn't name the Mac; the PC makers only that they don't know the number.
    if (source === "apple") return { kind: "serial", found: false, reason: body.reason };
  }
  if (failed) throw new Error("Serial number lookup failed");
  return null;
}

const cache = new Map<string, Promise<Identification | null>>();

/**
 * Looks the identifier up on the backend, asking only `sources` about a serial number when the maker
 * is already known. Null when no lookup knows it (a word that only looked like a serial number, say);
 * rejects when the backend can't be reached.
 */
export function identify(id: Identifier, sources?: SerialSource[]): Promise<Identification | null> {
  const asked = id.kind === "serial" ? sources ?? serialSources(id.serial) : [];
  const key = id.kind === "imei" ? `imei:${id.tac}` : `serial:${id.serial}:${asked.join(",")}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = id.kind === "imei" ? identifyImei(id.tac) : identifySerial(id.serial, asked);
    cache.set(key, pending);
    // Retry next time after a failure, or when Macfax's daily limit stopped a 2021+ Mac lookup.
    pending.then(
      (result) => { if (result?.kind === "serial" && !result.found && result.reason === "modern_serial") cache.delete(key); },
      () => cache.delete(key),
    );
  }
  return pending;
}

/** "i7-8565U · 16GB · 256GB · 14" FHD". */
export const specsSummary = (specs: PcSpecs) =>
  [specs.cpu, specs.ram, specs.storage, [specs.screen, specs.display].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

// ---------------------------------------------------------------------------------------------
// Quotes: the serial number or IMEI of each imported line

/** A serial number or IMEI in the line's serial column, or typed instead of a model name. */
export const lineIdentifier = (line: RawLine) => identifierIn(line.serial ?? "") ?? identifierIn(line.text);

const PC_MAKERS: Record<string, SerialSource> = { lenovo: "lenovo", hp: "hp", fujitsu: "fujitsu" };
const MISSING: Record<"cpu" | "ram" | "storage", string> = { cpu: "CPU non renseigné", ram: "RAM non renseignée", storage: "Stockage non renseigné" };

/**
 * Who to ask about a line's number: every possible maker when the text didn't name the device for
 * sure; only Lenovo, HP or Fujitsu when the text found one of their laptops but not its whole configuration
 * (the maker knows it). Nobody otherwise: the text said everything, and 2021+ Macs cost Macfax quota.
 */
export function lookupFor(id: Identifier, m: Match): SerialSource[] | "all" | null {
  if (m.status !== "matched") return "all";
  const maker = m.ref?.category === "laptop" ? PC_MAKERS[m.ref.brand.toLowerCase()] : undefined;
  if (id.kind === "serial" && maker && (!m.variant.cpu || !m.variant.ram || !m.variant.storage)) return [maker];
  return null;
}

/** The line's match once its serial number or IMEI is known: undefined when the lookup failed. */
export function withIdentification(line: RawLine, m: Match, id: Identification | null | undefined): Match {
  const note = (w: string) => ({ ...m, warnings: m.warnings.includes(w) ? m.warnings : [...m.warnings, w] });
  if (!id?.found) {
    // A line the text did name keeps it quietly; an unknown one says why the number didn't help.
    if (m.status === "matched") return m;
    if (id === undefined) return note("Identification par n° de série impossible : le backend Nexus ne répond pas");
    if (id === null) return note("N° de série non reconnu");
    if (id.kind === "imei") return note(`IMEI non reconnu (TAC ${id.tac} absent de la base)`);
    return note(id.reason === "modern_serial" ? "N° de série Mac récent : limite d'identification du jour atteinte" : "N° de série non reconnu");
  }

  const name = id.kind === "serial" ? `${id.brand} ${id.name}` : `${id.brand} ${id.model}`;
  const details = id.kind === "serial" ? (id.specs ? specsSummary(id.specs) : undefined) : id.details || undefined;
  if (!id.ref) {
    if (m.status === "matched") return m; // maybe only named differently from the catalogue
    // The maker gave the configuration: it is no longer missing, only the model is.
    const known = id.kind === "serial" && id.specs ? (Object.keys(MISSING) as (keyof typeof MISSING)[]).filter((f) => id.specs![f]).map((f) => MISSING[f]) : [];
    const warnings = [...m.warnings.filter((w) => !known.includes(w)), `${id.kind === "imei" ? "IMEI" : "N° de série"} : ${name}${details ? ` (${details})` : ""}, absent du catalogue`];
    return m.status === "unmatched" ? { ...m, warnings, identified: { brand: id.brand, model: id.kind === "serial" ? id.name : id.model, details } } : { ...m, warnings };
  }
  if (m.status === "matched" && m.ref?.id !== id.ref.id) return note(`Le n° de série indique ${name}`);

  // What the line says comes first (it may describe upgrades); the factory configuration fills the gaps.
  const fromText = matchAgainst(line, id.ref);
  const factory = factoryVariant(id.ref, id);
  const variant = { ...factory, ...Object.fromEntries(Object.entries(fromText.variant).filter(([, v]) => v)) };
  const filled = (Object.keys(MISSING) as (keyof typeof MISSING)[]).filter((f) => variant[f] && !fromText.variant[f]).map((f) => MISSING[f]);
  return { ...fromText, specs: m.specs, variant, warnings: fromText.warnings.filter((w) => !filled.includes(w)) };
}

/** Lookups running at once: each serial number can mean a request to Lenovo, HP or Apple. */
const PARALLEL = 4;

/**
 * Looks up the serial numbers and IMEIs of a quote's lines where they help (see lookupFor) and
 * returns the matches they improve. Each line costs one backend call at most, repeats none.
 */
export async function identifyMatches(lines: RawLine[], matches: Match[], onProgress?: (done: number, total: number) => void): Promise<Match[]> {
  const out = [...matches];
  const queue = lines.flatMap((line, i) => {
    const id = lineIdentifier(line);
    const sources = id && lookupFor(id, matches[i]);
    return id && sources ? [{ i, id, sources: sources === "all" ? undefined : sources }] : [];
  });
  const total = queue.length;
  let done = 0;
  onProgress?.(0, total);
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const result = await identify(job.id, job.sources).catch(() => undefined);
      out[job.i] = withIdentification(lines[job.i], matches[job.i], result);
      onProgress?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return out;
}

export type IdentifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; result: Identification | null };

/** Live identification of what is being typed, once the typing pauses. */
export function useIdentification(id: Identifier | null): IdentifyState {
  const [state, setState] = useState<IdentifyState>({ status: "idle" });
  const path = id ? JSON.stringify(id) : "";

  useEffect(() => {
    if (!path) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    // A serial waits longer: half typed, it can look like a 2021+ serial, whose lookup uses Macfax quota.
    const timer = setTimeout(() => {
      identify(JSON.parse(path))
        .then((result) => { if (!cancelled) setState({ status: "done", result }); })
        .catch(() => { if (!cancelled) setState({ status: "error" }); });
    }, id?.kind === "serial" ? 1000 : 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [path]);

  return state;
}
