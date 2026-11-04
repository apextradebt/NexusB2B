import { CATALOG } from "@/lib/catalog";
import type { Grade, RefModel } from "@/types";
import type { StressList, Truth } from "@/lib/stress/types";

// Lists built from the catalogue with a fixed seed: every layout, language and way of writing a device
// suppliers use, each with the answer it should give.

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const pick = <T,>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const int = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

const phones = CATALOG.filter((c) => c.category === "phone" && c.storage?.length);
const tablets = CATALOG.filter((c) => c.category === "tablet" && c.storage?.length);
const laptops = CATALOG.filter((c) => c.category === "laptop" && c.cpu?.length && c.ram?.length && c.storage?.length);

type Dev = { ref: RefModel; storage: string; ram?: string; cpu?: string; grade: Grade; qty: number };

const anyGrade = (r: R) => pick(r, ["A", "A", "B", "B", "B", "C", "C", "D", "E"] as Grade[]);
function dev(r: R, pool: RefModel[]): Dev {
  const ref = pick(r, pool);
  const laptop = ref.category === "laptop";
  // Whole sizes only: the catalogue's "1.5TB" and "500GB HDD" are build options no list spells that way.
  const sizes = ref.storage!.filter((s) => /^\d+(?:GB|TB)$/.test(s));
  const cpu = laptop ? pick(r, ref.cpu!) : undefined;
  // An AMD model has its own RAM options.
  const rams = cpu?.startsWith("Ryzen") && ref.ramAmd ? ref.ramAmd : ref.ram;
  return { ref, storage: pick(r, sizes.length ? sizes : ref.storage!), ram: laptop ? pick(r, rams!) : undefined, cpu, grade: anyGrade(r), qty: int(r, 1, 60) };
}
/** n different devices: no two lines of a list are the same configuration and grade. */
function devs(r: R, n: number, pools: RefModel[][] = [phones, phones, tablets, laptops]): Dev[] {
  const out = new Map<string, Dev>();
  for (let i = 0; out.size < n && i < n * 20; i++) {
    const d = dev(r, pick(r, pools));
    out.set(`${d.ref.id}|${d.storage}|${d.ram}|${d.cpu}|${d.grade}`, d);
  }
  return [...out.values()];
}
const truth = (ds: Dev[]): Truth[] => ds.map((d) => ({ model: d.ref.model, storage: d.storage, ram: d.ram, cpu: d.cpu, grade: d.grade, qty: d.qty }));

const full = (ref: RefModel) => (ref.model.toLowerCase().startsWith(ref.brand.toLowerCase()) ? ref.model : `${ref.brand} ${ref.model}`);
const go = (s: string) => s.replace("GB", " Go").replace("TB", " To");
const spaced = (s: string) => s.replace(/(GB|TB)/, " $1");
const num = (s: string) => s.replace(/GB|TB/, "");

const COLOURS = {
  en: ["Black", "White", "Blue", "Silver", "Space Gray", "Midnight", "Graphite", "Rose Gold"],
  fr: ["Noir", "Blanc", "Bleu", "Argent", "Gris sidéral", "Minuit", "Graphite", "Or rose"],
  de: ["Schwarz", "Weiß", "Blau", "Silber", "Spacegrau", "Mitternacht"],
};
const cpuWords = (c: string) => (/^i\d/.test(c) ? `Intel Core ${c}` : c);
const intelFull = (c: string) => {
  const m = c.match(/^i\d-(\d{1,2})\d{3}(?!\d)/);
  return m ? `${m[1]}th Gen Intel(R) Core(TM) ${c} @ 2.40GHz` : cpuWords(c);
};

// ---------------------------------------------------------------------------------------------
// Ways of writing a device in one cell.

type Namer = (d: Dev, r: R) => string;
const mobile: Record<string, Namer> = {
  plain: (d) => `${full(d.ref)} ${d.storage}`,
  upper: (d) => `${full(d.ref)} ${d.storage}`.toUpperCase(),
  lower: (d) => `${full(d.ref)} ${d.storage}`.toLowerCase(),
  spaced_capacity: (d) => `${full(d.ref)} ${spaced(d.storage)}`,
  colour_en: (d, r) => `${full(d.ref)} ${d.storage} ${pick(r, COLOURS.en)}`,
  colour_first: (d, r) => `${pick(r, COLOURS.en)} ${full(d.ref)} ${d.storage}`,
  tester: (d, r) => `${d.ref.model} GSM+CDMA ${d.storage} ${pick(r, COLOURS.en)}`.toUpperCase(),
  unlocked: (d, r) => `${full(d.ref)} ${d.storage} ${pick(r, COLOURS.en)} Unlocked`,
  fr_debloque: (d, r) => `${full(d.ref)} ${go(d.storage)} ${pick(r, COLOURS.fr)} débloqué`,
  fr_reconditionne: (d) => `Smartphone ${full(d.ref)} reconditionné ${go(d.storage)}`,
  de_ohne_simlock: (d, r) => `${full(d.ref)} ${d.storage} ${pick(r, COLOURS.de)} ohne Simlock`,
  hyphens: (d) => `${full(d.ref)} ${d.storage}`.replace(/\s/g, "-"),
  underscores: (d) => `${full(d.ref)} ${d.storage}`.replace(/\s/g, "_").toUpperCase(),
  brackets: (d) => `${full(d.ref)} (${d.storage})`,
  slashes: (d, r) => `${full(d.ref)} / ${d.storage} / ${pick(r, COLOURS.en)}`,
  commas: (d, r) => `${full(d.ref)}, ${spaced(d.storage)}, ${pick(r, COLOURS.en)}`,
  dual_sim: (d) => `${full(d.ref)} Dual SIM ${d.storage} 5G`,
  refurbished: (d, r) => `Refurbished ${full(d.ref)} ${d.storage} - ${pick(r, COLOURS.en)}`,
  capacity_first: (d) => `${d.storage} ${full(d.ref)}`,
  brand_last: (d) => `${d.ref.model} ${d.storage} ${d.ref.brand}`,
};
const laptop: Record<string, Namer> = {
  plain: (d) => `${full(d.ref)} ${d.cpu} ${d.ram} ${d.storage} SSD`,
  upper: (d) => `${full(d.ref)} ${d.cpu} ${d.ram} ${d.storage} SSD`.toUpperCase(),
  slashes: (d) => `${d.ref.model} ${d.cpu}/${num(d.ram!)}/${d.storage}`,
  brackets: (d) => `${full(d.ref)} (${d.cpu}, ${d.ram} RAM, ${d.storage} SSD)`,
  long: (d) => `${full(d.ref)} FHD ${cpuWords(d.cpu!)} ${d.ram} DDR4 ${d.storage} NVMe Win11 Pro AZERTY`,
  fr_pc: (d) => `PC portable ${full(d.ref)} - ${cpuWords(d.cpu!)} - ${go(d.ram!)} RAM - SSD ${go(d.storage)}`,
  intel_full: (d) => `${d.ref.model} ${intelFull(d.cpu!)} ${d.ram} ${d.storage}`,
  dashes: (d) => `${full(d.ref)} - ${d.cpu} - ${d.ram} - ${d.storage}`,
  pipes: (d) => `${full(d.ref)} | ${d.cpu} | ${d.ram} | ${d.storage}`,
  ram_ssd_words: (d) => `${full(d.ref)} ${d.cpu} RAM ${d.ram} SSD ${d.storage}`,
  german: (d) => `Notebook ${full(d.ref)} ${d.cpu} ${d.ram} RAM ${d.storage} SSD Tastatur DE`,
};
const nameOf = (d: Dev, style: string, r: R) => (d.ref.category === "laptop" ? (laptop[style] ?? laptop.plain) : (mobile[style] ?? mobile.plain))(d, r);

// ---------------------------------------------------------------------------------------------
// Ways of writing a grade or a count.

const GRADE_WORDS: Record<string, Record<Grade, string>> = {
  letter: { A: "A", B: "B", C: "C", D: "D", E: "E" },
  grade: { A: "Grade A", B: "Grade B", C: "Grade C", D: "Grade D", E: "Grade E" },
  class: { A: "Class A", B: "Class B", C: "Class C", D: "Class D", E: "Class E" },
  suffix: { A: "A grade", B: "B grade", C: "C grade", D: "D grade", E: "E grade" },
  plus_minus: { A: "A+", B: "B+", C: "C-", D: "D", E: "E" },
  lower: { A: "a", B: "b", C: "c", D: "d", E: "e" },
  en: { A: "Excellent", B: "Very good", C: "Good", D: "Fair", E: "Broken" },
  en2: { A: "Like new", B: "Very Good", C: "Good", D: "Acceptable", E: "For parts" },
  fr: { A: "Comme neuf", B: "Très bon état", C: "Bon état", D: "État correct", E: "Pour pièces" },
  de: { A: "Wie neu", B: "Sehr gut", C: "Gut", D: "Akzeptabel", E: "Defekt" },
  es: { A: "Como nuevo", B: "Muy bueno", C: "Bueno", D: "Aceptable", E: "Averiado" },
  it: { A: "Come nuovo", B: "Ottimo", C: "Buono", D: "Discreto", E: "Guasto" },
  nl: { A: "Zo goed als nieuw", B: "Zeer goed", C: "Goed", D: "Redelijk", E: "Defect" },
  pt: { A: "Como novo", B: "Muito bom", C: "Bom", D: "Razoável", E: "Avariado" },
  pl: { A: "Jak nowy", B: "Bardzo dobry", C: "Dobry", D: "Dostateczny", E: "Uszkodzony" },
};

const COUNTS: Record<string, (n: number) => string> = {
  plain: (n) => String(n),
  pcs: (n) => `${n} pcs`,
  x_first: (n) => `x${n}`,
  units: (n) => `${n} units`,
  stk: (n) => `${n} Stk.`,
  decimal: (n) => `${n}.0`,
  pieces_fr: (n) => `${n} pièces`,
  thousands_comma: (n) => (n * 100).toLocaleString("en-US"),
  thousands_space: (n) => (n * 100).toLocaleString("en-US").replace(",", " "),
};

// ---------------------------------------------------------------------------------------------
// Table headers, by language.

type Kind = "brand" | "name" | "cpu" | "ram" | "storage" | "grade" | "qty" | "colour" | "ean" | "sku" | "serial" | "imei" | "price" | "location" | "keyboard" | "battery" | "notes";
const HEADERS: Record<string, Record<Kind, string>> = {
  en: { brand: "Brand", name: "Model", cpu: "CPU", ram: "RAM", storage: "Storage", grade: "Grade", qty: "Qty", colour: "Colour", ean: "EAN", sku: "SKU", serial: "Serial Number", imei: "IMEI", price: "Price", location: "Location", keyboard: "Keyboard", battery: "Battery %", notes: "Notes" },
  en_trade: { brand: "Manufacturer", name: "Item Description", cpu: "Processor Type", ram: "Memory Size", storage: "HDD Size", grade: "Cosmetic", qty: "Units", colour: "Color", ean: "UPC", sku: "Part #", serial: "S/N", imei: "IMEI 1", price: "Unit Price EUR", location: "Bin", keyboard: "Keyboard Layout", battery: "Battery Health", notes: "Remarks" },
  en_stock: { brand: "OEM", name: "Product Name", cpu: "Proc", ram: "Mem", storage: "SSD", grade: "Condition", qty: "Available", colour: "Finish", ean: "GTIN", sku: "Item Code", serial: "Service Tag", imei: "IMEI", price: "Sell Price", location: "Warehouse", keyboard: "KB", battery: "Battery Cycles", notes: "Comment" },
  fr: { brand: "Marque", name: "Modèle", cpu: "Processeur", ram: "Mémoire", storage: "Stockage", grade: "État", qty: "Quantité", colour: "Couleur", ean: "Code EAN", sku: "Réf.", serial: "N° de série", imei: "IMEI", price: "Prix HT", location: "Emplacement", keyboard: "Clavier", battery: "Batterie", notes: "Commentaire" },
  fr_court: { brand: "Fabricant", name: "Désignation", cpu: "Proc.", ram: "RAM", storage: "Disque", grade: "Grade", qty: "Qté", colour: "Coloris", ean: "Gencod", sku: "Code article", serial: "Numéro de série", imei: "IMEI", price: "PU HT", location: "Dépôt", keyboard: "Clavier", battery: "Santé batterie", notes: "Remarques" },
  de: { brand: "Hersteller", name: "Modell", cpu: "Prozessor", ram: "Arbeitsspeicher", storage: "Festplatte", grade: "Zustand", qty: "Menge", colour: "Farbe", ean: "EAN", sku: "Artikelnummer", serial: "Seriennummer", imei: "IMEI", price: "Preis", location: "Lagerort", keyboard: "Tastatur", battery: "Akku", notes: "Bemerkung" },
  es: { brand: "Marca", name: "Modelo", cpu: "Procesador", ram: "Memoria", storage: "Almacenamiento", grade: "Estado", qty: "Cantidad", colour: "Color", ean: "EAN", sku: "Referencia", serial: "Número de serie", imei: "IMEI", price: "Precio", location: "Almacén", keyboard: "Teclado", battery: "Batería", notes: "Comentarios" },
  it: { brand: "Marca", name: "Modello", cpu: "Processore", ram: "Memoria RAM", storage: "Archiviazione", grade: "Condizione", qty: "Quantità", colour: "Colore", ean: "EAN", sku: "Codice", serial: "Matricola", imei: "IMEI", price: "Prezzo", location: "Magazzino", keyboard: "Tastiera", battery: "Batteria", notes: "Note" },
  nl: { brand: "Merk", name: "Model", cpu: "Processor", ram: "Geheugen", storage: "Opslag", grade: "Staat", qty: "Aantal", colour: "Kleur", ean: "EAN", sku: "Artikelnummer", serial: "Serienummer", imei: "IMEI", price: "Prijs", location: "Locatie", keyboard: "Toetsenbord", battery: "Accu", notes: "Opmerking" },
  pt: { brand: "Marca", name: "Modelo", cpu: "Processador", ram: "Memória", storage: "Armazenamento", grade: "Estado", qty: "Quantidade", colour: "Cor", ean: "EAN", sku: "Referência", serial: "Número de série", imei: "IMEI", price: "Preço", location: "Armazém", keyboard: "Teclado", battery: "Bateria", notes: "Observações" },
  pl: { brand: "Marka", name: "Model", cpu: "Procesor", ram: "Pamięć RAM", storage: "Dysk", grade: "Stan", qty: "Ilość", colour: "Kolor", ean: "EAN", sku: "Kod", serial: "Numer seryjny", imei: "IMEI", price: "Cena", location: "Magazyn", keyboard: "Klawiatura", battery: "Bateria", notes: "Uwagi" },
  sv: { brand: "Märke", name: "Modell", cpu: "Processor", ram: "Minne", storage: "Lagring", grade: "Skick", qty: "Antal", colour: "Färg", ean: "EAN", sku: "Artikelnummer", serial: "Serienummer", imei: "IMEI", price: "Pris", location: "Lager", keyboard: "Tangentbord", battery: "Batteri", notes: "Kommentar" },
  cs: { brand: "Značka", name: "Model", cpu: "Procesor", ram: "Paměť", storage: "Úložiště", grade: "Stav", qty: "Množství", colour: "Barva", ean: "EAN", sku: "Kód", serial: "Sériové číslo", imei: "IMEI", price: "Cena", location: "Sklad", keyboard: "Klávesnice", battery: "Baterie", notes: "Poznámka" },
};

const serial = (r: R) => Array.from({ length: 10 }, () => pick(r, [..."ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"])).join("");
const digits = (r: R, n: number) => Array.from({ length: n }, () => int(r, 0, 9)).join("");

type Opts = { lang?: string; style?: string; grades?: string; count?: string; split?: boolean; cols?: Kind[]; n?: number; pools?: RefModel[][] };

/** One cell of a device line. `split`: brand, CPU, RAM and storage have their own columns. */
function cell(k: Kind, d: Dev, r: R, o: Opts): string {
  switch (k) {
    case "brand": return d.ref.brand;
    case "name": return o.split ? d.ref.model : nameOf(d, o.style ?? "plain", r);
    case "cpu": return d.cpu ?? "";
    case "ram": return d.ram ?? "";
    case "storage": return d.storage;
    case "grade": return GRADE_WORDS[o.grades ?? "letter"][d.grade];
    case "qty": return COUNTS[o.count ?? "plain"](d.qty);
    case "colour": return pick(r, COLOURS.en);
    case "ean": return `19${digits(r, 11)}`;
    case "sku": return `ART-${digits(r, 5)}`;
    case "serial": return serial(r);
    case "imei": return `35${digits(r, 13)}`;
    case "price": return `${int(r, 80, 900)},${pick(r, ["00", "50", "90"])} €`;
    case "location": return pick(r, ["A-12", "B-03", "Rack 7", "Paris", "Lyon"]);
    case "keyboard": return pick(r, ["AZERTY", "QWERTY", "QWERTZ", "FR", "UK", "DE"]);
    case "battery": return `${int(r, 72, 100)}%`;
    case "notes": return pick(r, ["", "", "Tested OK", "Minor scratches", "No charger", "Box included", "iCloud off"]);
  }
}

const quantities = (ds: Dev[], o: Opts) => (o.count?.startsWith("thousands") ? ds.map((d) => ({ ...d, qty: d.qty * 100 })) : ds);

function rows(r: R, ds: Dev[], o: Opts, cols: Kind[]) {
  return ds.map((d) => cols.map((k) => cell(k, d, r, o)));
}
const headerRow = (o: Opts, cols: Kind[]) => cols.map((k) => HEADERS[o.lang ?? "en"][k]);
const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
const join = (rs: string[][], sep: string) =>
  rs.map((row) => row.map((c) => (sep === "," && /[",]/.test(c)) || (sep === ";" && /[";]/.test(c)) ? quote(c) : c).join(sep)).join("\n");

const SPLIT: Kind[] = ["brand", "name", "cpu", "ram", "storage", "grade", "qty"];
const ONE: Kind[] = ["name", "grade", "qty"];

export function generatedLists(seed = 2026): StressList[] {
  const out: StressList[] = [];
  let i = 0;
  const add = (family: string, name: string, make: (r: R) => Omit<StressList, "name" | "family">) => {
    out.push({ family, name: `${String(out.length + 1).padStart(3, "0")} ${name}`, ...make(rng(seed + ++i * 7919)) });
  };

  // Every language, every separator, one column per field.
  const langs = ["en", "en_trade", "en_stock", "fr", "fr_court", "de", "es", "it", "nl", "pt", "pl", "sv", "cs"];
  const seps: [string, string][] = [[",", "comma"], [";", "semicolon"], ["\t", "tab"], ["|", "pipe"]];
  langs.forEach((lang, n) => {
    for (const [sep, label] of [seps[n % 4], seps[(n + 1) % 4]]) {
      add("Languages and separators", `${lang} headers, ${label}`, (r) => {
        const ds = devs(r, 10);
        const o: Opts = { lang, split: true };
        return { text: join([headerRow(o, SPLIT), ...rows(r, ds, o, SPLIT)], sep), truth: truth(ds) };
      });
    }
  });

  // Every way of writing a device, in one product column.
  for (const style of Object.keys(mobile)) {
    add("Device wording", `phones and tablets: ${style}`, (r) => {
      const ds = devs(r, 10, [phones, phones, phones, tablets]);
      const o: Opts = { style };
      return { text: join([headerRow(o, ONE), ...rows(r, ds, o, ONE)], ";"), truth: truth(ds) };
    });
  }
  for (const style of Object.keys(laptop)) {
    add("Device wording", `laptops: ${style}`, (r) => {
      const ds = devs(r, 10, [laptops]);
      const o: Opts = { style };
      return { text: join([headerRow(o, ONE), ...rows(r, ds, o, ONE)], ";"), truth: truth(ds) };
    });
  }

  // Every way of writing a grade or a count.
  for (const grades of Object.keys(GRADE_WORDS)) {
    add("Grade wording", `grades: ${grades}`, (r) => {
      const ds = devs(r, 10);
      const o: Opts = { grades, lang: "en" };
      return { text: join([headerRow(o, ONE), ...rows(r, ds, o, ONE)], ","), truth: truth(ds) };
    });
  }
  for (const count of Object.keys(COUNTS)) {
    add("Quantity wording", `quantities: ${count}`, (r) => {
      const o: Opts = { count, lang: "en" };
      const ds = devs(r, 10);
      return { text: join([headerRow(o, ONE), ...rows(r, ds, o, ONE)], ";"), truth: truth(quantities(ds, o)) };
    });
  }

  // Noise columns around the device.
  const noisy: [string, Kind[]][] = [
    ["EAN, SKU and colour", ["sku", "ean", "brand", "name", "colour", "grade", "qty"]],
    ["price before quantity", ["name", "grade", "price", "qty"]],
    ["quantity first", ["qty", "grade", "name"]],
    ["location, keyboard, notes", ["location", "name", "keyboard", "grade", "qty", "notes"]],
    ["battery beside the grade", ["name", "battery", "grade", "qty"]],
    ["every noise column at once", ["sku", "ean", "brand", "name", "colour", "location", "keyboard", "battery", "price", "grade", "qty", "notes"]],
  ];
  for (const [label, cols] of noisy) {
    for (const lang of ["en", "fr"]) {
      add("Noise columns", `${label}, ${lang}`, (r) => {
        const ds = devs(r, 10);
        const o: Opts = { lang };
        return { text: join([headerRow(o, cols), ...rows(r, ds, o, cols)], ";"), truth: truth(ds) };
      });
    }
  }

  // One row per unit: the list has no quantity, repeated devices add up.
  const units = (r: R, n: number, pools: RefModel[][]) => {
    const pool = devs(r, n, pools);
    const list: Dev[] = pool.flatMap((d) => Array.from({ length: int(r, 1, 6) }, () => d));
    return { pool: pool.map((d) => ({ ...d, qty: list.filter((x) => x === d).length })), list };
  };
  add("One row per unit", "serial numbers, laptops", (r) => {
    const { pool, list } = units(r, 6, [laptops]);
    const cols: Kind[] = ["serial", "brand", "name", "cpu", "ram", "storage", "grade"];
    const o: Opts = { split: true, lang: "en_trade" };
    return { text: join([headerRow(o, cols), ...rows(r, list, o, cols)], ","), truth: truth(pool) };
  });
  add("One row per unit", "IMEIs, phones", (r) => {
    const { pool, list } = units(r, 6, [phones]);
    const cols: Kind[] = ["imei", "name", "colour", "grade", "battery"];
    const o: Opts = { lang: "en" };
    return { text: join([headerRow(o, cols), ...rows(r, list, o, cols)], ";"), truth: truth(pool) };
  });
  add("One row per unit", "IMEIs, no header row", (r) => {
    const { pool, list } = units(r, 6, [phones]);
    return { text: join(rows(r, list, {}, ["imei", "name", "grade"]), "\t"), truth: truth(pool) };
  });
  add("One row per unit", "tester export, numbers as figures", (r) => {
    const { pool, list } = units(r, 6, [phones, tablets]);
    const head = ["Class", "Category", "Asset ID", "Mfg", "Model", "Serial Number", "CPU Speed (MHz)", "Memory (GB)", "HDD (GB)", "Monitor Size", "Test Status", "Grade", "Curr. mAh/OEM (%)"];
    const matrix = list.map((d) => ["COMMUNICATION", "MOBILE PHONES", int(r, 7e7, 8e7), d.ref.brand.toUpperCase(), mobile.tester(d, r), serial(r), 0, 0, Number(num(d.storage)) * (d.storage.endsWith("TB") ? 1024 : 1), 6.1, "Functional", d.grade, int(r, 7000, 10000) / 100]);
    return { matrix: [head, ...matrix], truth: truth(pool) };
  });

  // Pivots.
  add("Pivots", "counts per Class A–E, totals", (r) => {
    const ds = devs(r, 8, [phones]).map((d) => ({ ...d, name: `${d.ref.model} ${d.storage}` }));
    const counts = ds.map(() => ["A", "B", "C", "D", "E"].map(() => (r() < 0.5 ? 0 : int(r, 1, 80))));
    const lines = ds.map((d, n) => [d.name, ...counts[n].map((c) => (c ? String(c) : "")), String(counts[n].reduce((a, b) => a + b, 0))]);
    return {
      text: join([["Count of Model", "Column Labels"], ["Row Labels", "Class A", "Class B", "Class C", "Class D", "Class E", "Grand Total"], ...lines, ["Grand Total", "", "", "", "", "", "0"]], ","),
      truth: ds.flatMap((d, n) => counts[n].flatMap((c, g) => (c ? [{ model: d.ref.model, storage: d.storage, grade: "ABCDE"[g] as Grade, qty: c }] : []))),
    };
  });
  add("Pivots", "counts per grade letter, French", (r) => {
    const ds = devs(r, 8, [laptops]);
    const counts = ds.map(() => ["A", "B", "C"].map(() => (r() < 0.4 ? 0 : int(r, 1, 30))));
    const head = ["Marque", "Modèle", "Processeur", "RAM", "Stockage", "A", "B", "C"];
    const lines = ds.map((d, n) => [d.ref.brand, d.ref.model, d.cpu!, d.ram!, d.storage, ...counts[n].map((c) => (c ? String(c) : ""))]);
    return {
      text: join([head, ...lines], ";"),
      truth: ds.flatMap((d, n) => counts[n].flatMap((c, g) => (c ? [{ model: d.ref.model, storage: d.storage, ram: d.ram, cpu: d.cpu, grade: "ABC"[g] as Grade, qty: c }] : []))),
    };
  });
  add("Pivots", "counts per capacity", (r) => {
    const models = [...new Map(devs(r, 12, [phones]).map((d) => [d.ref.id, d.ref])).values()].slice(0, 6);
    const caps = ["64GB", "128GB", "256GB", "512GB"];
    const counts = models.map((m) => caps.map((c) => (m.storage!.includes(c) && r() < 0.8 ? int(r, 1, 50) : 0)));
    return {
      text: join([["Model", ...caps], ...models.map((m, n) => [m.model, ...counts[n].map((c) => (c ? String(c) : ""))])], ";"),
      truth: models.flatMap((m, n) => counts[n].flatMap((c, k) => (c ? [{ model: m.model, storage: caps[k], qty: c }] : []))),
    };
  });

  // Files with more around the table.
  const wrapped: [string, (head: string[], body: string[][], ds: Dev[], r: R) => string[][]][] = [
    ["title rows and blank lines", (h, b) => [["STOCK LIST WEEK 44"], ["Ex works Rotterdam"], [], h, ...b]],
    ["totals at the bottom", (h, b, ds) => [h, ...b, [], ["TOTAL", "", String(ds.reduce((n, d) => n + d.qty, 0))], ["Subtotal", "", "0"]]],
    ["no header row", (_, b) => b],
    ["two header rows", (h, b) => [["Device", "Stock", ""], h, ...b]],
    ["footer note", (h, b) => [h, ...b, [], ["All prices ex VAT. Goods sold as is."], ["Subject to prior sale."]]],
  ];
  for (const [label, wrap] of wrapped) {
    add("Layouts", label, (r) => {
      const ds = devs(r, 10);
      const o: Opts = { lang: "en" };
      return { text: join(wrap(headerRow(o, ONE), rows(r, ds, o, ONE), ds, r), ";"), truth: truth(ds) };
    });
  }
  add("Layouts", "category titles between the rows", (r) => {
    const a = devs(r, 5, [laptops]);
    const b = devs(r, 5, [phones]);
    const o: Opts = { lang: "fr" };
    return {
      text: join([headerRow(o, ONE), ["ORDINATEURS PORTABLES", "", ""], ...rows(r, a, o, ONE), ["SMARTPHONES", "", ""], ...rows(r, b, o, ONE)], ";"),
      truth: truth([...a, ...b]),
    };
  });
  add("Layouts", "brand titles between the rows", (r) => {
    const groups = ["Apple", "Samsung", "Google"].map((brand) => devs(r, 4, [phones.filter((p) => p.brand === brand)]));
    const body = groups.flatMap((g) => [[g[0].ref.brand.toUpperCase(), "", ""], ...g.map((d) => [`${d.ref.model} ${d.storage}`, d.grade, String(d.qty)])]);
    return { text: join([["Model", "Grade", "Qty"], ...body], ";"), truth: truth(groups.flat()) };
  });
  add("Layouts", "fixed width, copied from a PDF", (r) => {
    const ds = devs(r, 10);
    const body = ds.map((d) => [nameOf(d, "plain", r).padEnd(62), d.grade.padEnd(6), String(d.qty)].join("  "));
    return { text: [`${"Description".padEnd(62)}  ${"Grade".padEnd(6)}  Qty`, ...body].join("\n"), truth: truth(ds) };
  });
  add("Layouts", "markdown table", (r) => {
    const ds = devs(r, 10);
    const body = ds.map((d) => `| ${nameOf(d, "plain", r)} | ${d.grade} | ${d.qty} |`);
    return { text: ["| Model | Grade | Qty |", "|---|---|---|", ...body].join("\n"), truth: truth(ds) };
  });
  add("Layouts", "every field quoted", (r) => {
    const ds = devs(r, 10);
    const o: Opts = { split: true };
    return { text: [headerRow(o, SPLIT), ...rows(r, ds, o, SPLIT)].map((row) => row.map(quote).join(",")).join("\r\n"), truth: truth(ds) };
  });
  add("Layouts", "blocks of labelled fields", (r) => {
    const ds = devs(r, 8, [phones]);
    return { text: ds.map((d) => `Model: ${d.ref.brand} ${d.ref.model}\nStorage: ${d.storage}\nGrade: ${d.grade}\nQty: ${d.qty}`).join("\n\n"), truth: truth(ds) };
  });
  add("Layouts", "one device over several lines", (r) => {
    const ds = devs(r, 8, [laptops]);
    return { text: ds.map((d) => [full(d.ref), d.cpu, d.ram, `${d.storage} SSD`, `Grade ${d.grade}`, `Qty: ${d.qty}`].join("\n")).join("\n"), truth: truth(ds) };
  });

  // Free lines.
  const free: [string, (d: Dev, r: R, n: number) => string][] = [
    ["bullets with a dash", (d, r) => `- ${d.qty}x ${nameOf(d, "plain", r)} Grade ${d.grade}`],
    ["round bullets", (d, r) => `• ${nameOf(d, "plain", r)} – grade ${d.grade} – qty ${d.qty}`],
    ["numbered", (d, r, n) => `${n + 1}) ${nameOf(d, "plain", r)} Class ${d.grade} x ${d.qty}`],
    ["quantity last in pieces", (d, r) => `${nameOf(d, "plain", r)} grade ${d.grade} ${d.qty} pcs`],
    ["French sentences", (d, r) => `${d.qty} pièces ${nameOf(d, "plain", r)} grade ${d.grade}`],
  ];
  for (const [label, line] of free) {
    add("Free text", label, (r) => {
      const ds = devs(r, 10);
      return { text: ds.map((d, n) => line(d, r, n)).join("\n"), truth: truth(ds) };
    });
  }

  // Encodings.
  const encoded = (make: (s: string) => ArrayBuffer, label: string, lang: string, grades?: string) =>
    add("Encodings", label, (r) => {
      const ds = devs(r, 10);
      const o: Opts = { lang, split: true, grades };
      return { bytes: make(join([headerRow(o, SPLIT), ...rows(r, ds, o, SPLIT)], "\t")), truth: truth(ds) };
    });
  const utf8 = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  const utf16 = (s: string) => {
    const b = new Uint16Array(s.length + 1);
    b[0] = 0xfeff;
    for (let k = 0; k < s.length; k++) b[k + 1] = s.charCodeAt(k);
    return b.buffer;
  };
  const latin1 = (s: string) => Uint8Array.from([...s].map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63))).buffer as ArrayBuffer;
  encoded((s) => utf8(`﻿${s}`), "UTF-8 with a BOM", "fr", "fr");
  encoded(utf16, "UTF-16 (Excel Unicode text)", "de", "de");
  encoded(latin1, "Windows-1252, French accents", "fr", "fr");
  encoded((s) => utf8(s.replace(/\n/g, "\r\n")), "Windows line ends", "es", "es");

  // Excel sheets: numbers stay numbers.
  add("Excel", "capacities and quantities as numbers", (r) => {
    const ds = devs(r, 10, [phones]);
    const head = ["Brand", "Model", "GB", "Grade", "Qty"];
    return { matrix: [head, ...ds.map((d) => [d.ref.brand, d.ref.model, d.storage.endsWith("TB") ? 1024 : Number(num(d.storage)), d.grade, d.qty])], truth: truth(ds) };
  });
  add("Excel", "laptops, RAM and SSD as numbers", (r) => {
    const ds = devs(r, 10, [laptops]);
    const head = ["Brand", "Model", "Processor", "RAM (GB)", "SSD (GB)", "Grade", "Qty"];
    const gb = (s: string) => (s.endsWith("TB") ? Number(num(s)) * 1024 : Number(num(s)));
    return { matrix: [head, ...ds.map((d) => [d.ref.brand, d.ref.model, d.cpu!, gb(d.ram!), gb(d.storage), d.grade, d.qty])], truth: truth(ds) };
  });
  add("Excel", "title, logo row and merged cells", (r) => {
    const ds = devs(r, 10);
    const o: Opts = { lang: "fr", split: true };
    const blank = SPLIT.map(() => "");
    return { matrix: [["Nexus Stock", ...blank.slice(1)], blank, ["Date", "03/11/2026", ...blank.slice(2)], headerRow(o, SPLIT), ...rows(r, ds, o, SPLIT)], truth: truth(ds) };
  });
  return out;
}
