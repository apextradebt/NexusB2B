import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import type { ColumnMapping, Field, Grade, RawLine } from "@/types";
import { GRADES } from "@/types";
import { CATALOG } from "@/lib/catalog";
import { matchLine, parseSpecs } from "@/lib/match";

export type Table = { headers: string[]; rows: string[][] };

const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/ /g, " ").trim());

export const normHeader = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

// Header synonyms (FR, EN, DE, ES, IT, NL, PT). Order matters: first match wins.
const SYNONYMS: [Field, string[]][] = [
  ["serial", ["serial", "serial number", "serial no", "sn", "s n", "imei", "imei1", "imei 1", "numero de serie", "n de serie", "no de serie", "service tag", "asset", "asset tag", "seriennummer", "numero de serie", "numero serie", "serienummer", "matricola"]],
  ["quantity", ["qty", "qte", "qt", "quantity", "quantite", "nb", "nbr", "nombre", "count", "units", "unites", "pcs", "pieces", "stock", "available", "avail", "dispo", "disponible", "menge", "anzahl", "stuck", "cantidad", "uds", "unidades", "quantita", "aantal", "quantidade", "volume", "total qty", "total quantity"]],
  ["grade", ["grade", "grading", "class", "classe", "condition", "etat", "cosmetic", "cosmetique", "cosmetic grade", "zustand", "klasse", "estado", "grado", "condizione", "staat", "conditie", "categorie"]],
  ["brand", ["brand", "marque", "manufacturer", "fabricant", "make", "constructeur", "oem", "vendor", "hersteller", "marke", "marca", "fabricante", "produttore", "merk", "fabrikant"]],
  ["cpu", ["cpu", "processor", "processeur", "proc", "prozessor", "procesador", "processore", "processador", "chip", "chipset"]],
  ["ram", ["ram", "memory", "memoire", "memoire vive", "arbeitsspeicher", "speicher ram", "memoria ram", "memoria", "geheugen", "werkgeheugen"]],
  ["storage", ["storage", "stockage", "ssd", "hdd", "disk", "disque", "disque dur", "capacity", "capacite", "rom", "hard drive", "drive", "festplatte", "speicher", "speicherplatz", "almacenamiento", "disco", "archiviazione", "opslag", "armazenamento", "gb", "go"]],
  ["model", ["model", "models", "model name", "modele", "modell", "modelo", "modello", "device", "appareil", "product", "product name", "produit", "produkt", "producto", "prodotto", "row labels", "etiquettes de lignes", "article", "artikel", "articulo", "name", "nom", "bezeichnung", "item", "item name", "hardware", "type", "typ", "tipo", "family", "gamme"]],
  ["description", ["description", "item description", "product description", "designation", "libelle", "details", "spec", "specs", "specification", "specifications", "configuration", "config", "beschreibung", "descripcion", "descrizione", "omschrijving", "descricao", "reference", "ref"]],
];

// Identifier columns (SKU, part number, EAN…): recognised as headers, left out of the matching.
const ID_HEADERS = ["sku", "part number", "part no", "part", "pn", "p n", "mpn", "ean", "upc", "gtin", "code", "code article", "article code", "product code", "item code", "item number", "id", "lot", "lot number", "po", "order", "price", "prix", "unit price", "cost", "total price", "amount", "montant", "color", "colour", "couleur", "farbe", "keyboard", "clavier", "layout", "os", "notes", "note", "comment", "comments", "commentaire", "remarks", "location", "warehouse"];

// Headers that name nothing ("Column 3", "Col1", "Field 2"): still a header row, never data.
const GENERIC_HEADER = /^(col|column|colonne|columna|spalte|field|champ|campo|f)\s*\d{1,3}$/;

const isIdHeader = (h: string) => ID_HEADERS.some((w) => h === w || h.startsWith(w + " ") || h.endsWith(" " + w));

export function guessField(header: string): Field {
  const h = normHeader(header);
  if (!h || ID_HEADERS.includes(h)) return "ignore";
  for (const [field, words] of SYNONYMS) {
    if (words.some((w) => h === w || h.startsWith(w + " ") || h.endsWith(" " + w))) return field;
  }
  return "ignore";
}

/** "Class A", "Grade B", "A", "Grade A+" → grade letter; null when the header is not a grade label. */
export function gradeFromLabel(label: string): Grade | null {
  const h = normHeader(label);
  const m = h.match(/^(?:class|classe|grade|cat|categorie|klasse|grado)?\s*([a-e])\+?$/);
  return m ? (m[1].toUpperCase() as Grade) : null;
}

/** Free-text grade value → A–E ("Grade A+", "Class B", "Très bon état", "Fair"…). */
export function parseGrade(raw?: string): Grade | undefined {
  if (!raw) return undefined;
  const g = gradeFromLabel(raw);
  if (g) return g;
  const h = normHeader(raw);
  if (/(parfait|excellent|like new|comme neuf|mint|neuf|new|wie neu|como nuevo)/.test(h)) return "A";
  if (/(tres bon|very good|sehr gut|muy bueno)/.test(h)) return "B";
  if (/(bon|good|gut|bueno)/.test(h)) return "C";
  if (/(correct|fair|moyen|acceptable|poor|usure|worn)/.test(h)) return "D";
  if (/(hs|broken|defect|casse|for parts|pour pieces|faulty|defekt|dead)/.test(h)) return "E";
  const letter = h.match(/\b([a-e])\b/);
  return letter && GRADES.includes(letter[1].toUpperCase() as Grade) ? (letter[1].toUpperCase() as Grade) : undefined;
}

/** "12", "12 pcs", "1 234", "1.234", "x3", "3.0" → integer; undefined when the cell is not a count. */
export function parseQuantity(raw?: string): number | undefined {
  if (!raw) return undefined;
  let s = raw.toLowerCase().replace(/\s*(pcs?|pieces?|pièces?|units?|unites?|unités?|u|ea|stk|uds?|x)\.?\s*$/i, "").trim();
  if (/^\d{1,3}([ .,']\d{3})+$/.test(s)) s = s.replace(/[ .,']/g, "");
  s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Math.round(Number(s));
  return n > 0 ? n : undefined;
}

// ---------------------------------------------------------------------------------------------
// Cell classification: what a value looks like, independent of its header.

const KNOWN_BRANDS = new Set(
  [
    ...CATALOG.map((r) => r.brand),
    "hewlett packard", "hewlett-packard", "hp inc", "hpe", "acer", "toshiba", "dynabook", "msi", "razer", "lg", "panasonic", "getac",
    "alcatel", "zte", "vivo", "realme", "tcl", "wiko", "blackberry", "iphone", "ipad", "galaxy", "thinkpad", "surface", "pixel",
  ].map((b) => normHeader(b)),
);
const isBrand = (v: string) => KNOWN_BRANDS.has(normHeader(v));

const RAM_SIZES = new Set([2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 36, 40, 48, 64, 96, 128]);
const STORAGE_SIZES = new Set([16, 32, 64, 120, 128, 180, 240, 250, 256, 480, 500, 512, 1000, 1024, 2000, 2048]);

const CPU_RX = /\b(i[3579][\s-]*\d{4,5}[a-z]{0,2}\d?|core\s*(?:i[3579]|ultra)|ryzen\s*[3579]|celeron|pentium|xeon|apple\s*m[1-4]|\bm[1-4]\s*(?:pro|max)?\b|snapdragon|athlon)/i;
const IMEI_RX = /^\d{14,16}$/;
// Serials / part numbers: one token of 6–20 letters and digits mixed, no spaces.
const CODE_RX = /^(?=.*\d)(?=.*[a-z])[a-z0-9-]{6,20}$/i;

export type Kind = "serial" | "quantity" | "grade" | "ram" | "storage" | "cpu" | "brand" | "specs" | "model" | "text" | "number";

function capacity(v: string): { n: number; unit?: string } | undefined {
  const m = v.toLowerCase().replace(/\s+/g, " ").match(/^(\d{1,4})\s?(gb|go|g|tb|to|t)?\b\s*(ssd|hdd|nvme|emmc|ram|ddr\d?|lpddr\d?x?|m\.2|pcie|flash)?$/);
  if (!m) return undefined;
  return { n: Number(m[1]), unit: m[2] ? (m[2][0] === "t" ? "tb" : "gb") : undefined };
}

/** Best guess of what one cell holds. */
export function classifyCell(v: string): Kind | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (IMEI_RX.test(s.replace(/\s/g, ""))) return "serial";
  const cap = capacity(s);
  if (cap?.unit) {
    if (cap.unit === "tb") return "storage";
    if (/ram|ddr/i.test(s)) return "ram";
    if (/ssd|hdd|nvme|emmc|m\.2|pcie|flash/i.test(s)) return "storage";
    return RAM_SIZES.has(cap.n) && cap.n <= 48 ? "ram" : "storage";
  }
  if (parseQuantity(s) !== undefined && /^[\dx .,'pcsuniteé]+$/i.test(s)) return "number";
  if (gradeFromLabel(s) || (s.length <= 24 && parseGrade(s) && !/\d/.test(s))) return "grade";
  if (isBrand(s)) return "brand";
  if (CODE_RX.test(s) && !CPU_RX.test(s) && matchLine({ row: 0, text: s, quantity: 1 }).status === "unmatched") return "serial";
  if (CPU_RX.test(s) && s.length <= 40 && matchLine({ row: 0, text: s, quantity: 1 }).status === "unmatched") return "cpu";
  if (matchLine({ row: 0, text: s, quantity: 1 }).status !== "unmatched") return "model";
  const sp = parseSpecs({ text: s });
  if (sp.cpu || sp.ram || sp.storage || /\b\d{1,2}\s*\/\s*\d{3,4}\b/.test(s)) return "specs";
  return "text";
}

// ---------------------------------------------------------------------------------------------
// Header row detection

/** Cells that are clearly data (a device, a number, a spec, a brand) — a header row has none. */
function dataCells(row: string[]) {
  return row.filter((c) => {
    if (!c || isHeaderWord(c)) return false;
    return /\d/.test(c) || isBrand(c) || matchLine({ row: 0, text: c, quantity: 1 }).status !== "unmatched";
  }).length;
}
const isHeaderWord = (c: string) => guessField(c) !== "ignore" || !!gradeFromLabel(c) || GENERIC_HEADER.test(normHeader(c)) || isIdHeader(normHeader(c));
function headerCells(row: string[]) {
  return row.filter((c) => c && isHeaderWord(c)).length;
}

/**
 * Pick the header row among the first 20, or -1 when the file starts straight with data.
 * Pivot exports start with title rows ("Count of Model", "Column Labels"), so row 0 is not always it.
 */
function findHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 20).forEach((row, i) => {
    const filled = row.filter(Boolean).length;
    if (filled < 2 && !(filled === 1 && rows[i + 1] && headerCells(row) === 1)) return;
    const hits = headerCells(row);
    const data = dataCells(row);
    const nextData = rows[i + 1] ? dataCells(rows[i + 1]) : 0;
    // Unknown words over a row of data ("SKU;Avail;Spec" above "X1;4;i5/16/256") still read as a header.
    const shape = data === 0 && nextData > 0 ? 1 : 0;
    const score = hits * 2 + shape - data * 2;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function toTable(matrix: string[][]): Table {
  const rows = matrix.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
  if (rows.length === 0) return { headers: [], rows: [] };
  const h = findHeaderRow(rows);
  const width = Math.max(...rows.map((r) => r.length));
  // Drop columns that are empty all the way down (trailing separators, spacer columns).
  const keep = Array.from({ length: width }, (_, i) => i).filter((i) => rows.some((r, j) => j !== h && r[i]));
  const seen = new Map<string, number>();
  const headers = keep.map((i, n) => {
    const base = (h >= 0 && rows[h][i]) || `Colonne ${n + 1}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return k ? `${base} (${k + 1})` : base;
  });
  const body = rows.slice(h + 1).map((r) => keep.map((i) => r[i] ?? ""));
  return { headers, rows: body };
}

/** Decode a text file: UTF-8 (with or without BOM), UTF-16 (Excel "Unicode text"), else Windows-1252 (Excel "CSV"). */
export function decode(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export async function readFile(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const sheets = await readXlsxFile(file);
    // Use the sheet with the most filled rows (pivot sheets often sit next to the raw export).
    const sheet = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a));
    return toTable(sheet.data.map((r) => r.map(clean)));
  }
  if (name.endsWith(".xls")) {
    throw new Error("Format .xls (Excel 97) non supporté : enregistrez le fichier en .xlsx ou .csv.");
  }
  return parseText(decode(await file.arrayBuffer()));
}

export function parseText(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, "").trim(), { skipEmptyLines: true, delimiter: "", delimitersToGuess: [";", ",", "\t", "|"] });
  let data = res.data;
  // A single column with runs of 2+ spaces is a fixed-width / copied-from-PDF list.
  if (data.every((r) => r.length === 1) && data.filter((r) => / {2,}/.test(r[0])).length > data.length / 2) {
    data = data.map((r) => r[0].split(/ {2,}/));
  }
  return toTable(data);
}

// ---------------------------------------------------------------------------------------------
// Column roles

export type Layout = { mapping: ColumnMapping; gradeColumns: Record<string, Grade> };

type Profile = { share: Partial<Record<Kind, number>>; model: number; unique: number; filled: number };

function profileColumn(values: string[]): Profile {
  const sample = values.filter(Boolean).slice(0, 40);
  const share: Partial<Record<Kind, number>> = {};
  for (const v of sample) {
    const k = classifyCell(v);
    if (k) share[k] = (share[k] ?? 0) + 1 / sample.length;
  }
  return {
    share,
    model: share.model ?? 0,
    unique: new Set(sample).size / Math.max(1, sample.length),
    filled: values.filter(Boolean).length / Math.max(1, values.length),
  };
}

/** Field a column's content points to, when it is unambiguous enough. */
function fieldFromContent(p: Profile, values: string[]): Field | undefined {
  const s = p.share;
  const top = (k: Kind, min: number) => (s[k] ?? 0) >= min;
  if (top("serial", 0.7) && p.unique > 0.8) return "serial";
  if (top("model", 0.5)) return "model";
  if (top("cpu", 0.6)) return "cpu";
  if (top("brand", 0.7)) return "brand";
  if (top("grade", 0.7)) return "grade";
  if (top("ram", 0.7)) return "ram";
  if (top("storage", 0.7)) return "storage";
  if (top("number", 0.8)) {
    const nums = values.map((v) => parseQuantity(v)).filter((n): n is number => n !== undefined);
    // Unit-less capacities ("256", "512", "1000"), otherwise counts.
    if (nums.length && nums.every((n) => STORAGE_SIZES.has(n)) && nums.some((n) => n >= 120)) return "storage";
    if (nums.length >= 2 && nums.every((n) => [4, 8, 16, 32, 64].includes(n)) && new Set(nums).size > 1) return "ram";
    // Row numbers / item codes (1001, 1002, 1003…) count nothing.
    if (nums.length >= 3 && nums.every((n, k) => k === 0 || n === nums[k - 1] + 1)) return undefined;
    return "quantity";
  }
  if (top("specs", 0.5) || (s.specs ?? 0) + (s.cpu ?? 0) + (s.ram ?? 0) + (s.storage ?? 0) >= 0.6) return "description";
  if ((s.model ?? 0) >= 0.2) return "description";
  return undefined;
}

/** Whether a header's meaning and the column's content can live together. */
function compatible(header: Field, content: Field | undefined, p: Profile): boolean {
  if (!content || header === content) return true;
  if (header === "model" || header === "description") return content !== "serial" && content !== "quantity" || p.model >= 0.3;
  if (header === "quantity") return content === "quantity" || content === "ram" || content === "storage";
  if (header === "serial") return content === "serial" || content === "quantity";
  if (header === "storage" || header === "ram" || header === "cpu") return content === "description" || content === "quantity" || content === "storage" || content === "ram";
  if (header === "grade") return content === "grade" || content === "description";
  return true;
}

/**
 * Auto-detect column roles from the header name AND what the column holds, so unknown or missing
 * headers, other languages and misleading names ("Reference" holding serials) still land right.
 * Pivot layouts (one count column per grade) are detected too.
 */
export function detectLayout(table: Table): Layout {
  const mapping: ColumnMapping = {};
  const gradeColumns: Record<string, Grade> = {};
  const colValues = (i: number) => table.rows.map((r) => r[i] ?? "");
  const profiles = table.headers.map((_, i) => profileColumn(colValues(i)));

  table.headers.forEach((header, i) => {
    const values = colValues(i);
    const g = gradeFromLabel(header);
    const numeric = values.slice(0, 50).every((v) => !v || parseQuantity(v) !== undefined);
    if (g && numeric) {
      gradeColumns[header] = g;
      mapping[header] = "ignore";
      return;
    }
    const byHeader = guessField(header);
    if (byHeader === "ignore" && isIdHeader(normHeader(header)) && profiles[i].model < 0.3) {
      mapping[header] = "ignore";
      return;
    }
    const byContent = fieldFromContent(profiles[i], values);
    mapping[header] = byHeader !== "ignore" && compatible(byHeader, byContent, profiles[i]) ? byHeader : byContent ?? (byHeader === "ignore" ? "ignore" : byHeader);
  });

  // The column that actually names devices becomes "model"; other device-naming columns add to the text.
  const modelCols = table.headers.map((h, i) => ({ h, i })).filter(({ h }) => mapping[h] === "model" || mapping[h] === "description");
  const best = [...modelCols].sort((a, b) => profiles[b.i].model - profiles[a.i].model)[0];
  if (best && profiles[best.i].model > 0) {
    for (const { h, i } of modelCols) {
      if (h === best.h) mapping[h] = "model";
      else if (mapping[h] === "model") {
        const sh = profiles[i].share;
        const specs = (sh.specs ?? 0) + (sh.cpu ?? 0) + (sh.ram ?? 0) + (sh.storage ?? 0);
        mapping[h] = profiles[i].model > 0 || specs > 0.3 ? "description" : "ignore";
      }
    }
  }

  // One column per structured field; extra ones are folded into the free text.
  // Columns whose header names the field claim it first ("Qté" beats an "Article" column of numbers).
  const used = new Set<Field>();
  const order = [...table.headers].sort((a, b) => Number(guessField(b) === mapping[b]) - Number(guessField(a) === mapping[a]));
  order.forEach((h) => {
    const f = mapping[h];
    if (f === "ignore" || f === "description" || gradeColumns[h]) return;
    if (used.has(f)) mapping[h] = f === "serial" || f === "quantity" || f === "grade" ? "ignore" : "description";
    else used.add(f);
  });

  // Still no device column: fall back to the most text-like column.
  if (!Object.values(mapping).some((f) => f === "model" || f === "description")) {
    const text = table.headers
      .map((h, i) => ({ h, t: (profiles[i].share.text ?? 0) + (profiles[i].share.specs ?? 0) }))
      .filter(({ h }) => !gradeColumns[h] && !/total|blank/i.test(h) && (mapping[h] === "ignore" || mapping[h] === "serial"))
      .sort((a, b) => b.t - a.t)[0];
    if (text) mapping[text.h] = "model";
  }
  return { mapping, gradeColumns };
}

// ---------------------------------------------------------------------------------------------
// Lines

const SKIP = /^(grand total|total|totals|sum|somme|\(blank\)|\(vide\)|-+|—|sous-total|subtotal|sub-total|gesamt|summe)(?=\s|:|$)/i;

// Quantity and grade written into the text itself: "3x Latitude 5420", "iPhone 13 x 5", "qty: 2", "Grade B".
const QTY_IN_TEXT = [
  /^\s*(\d{1,5})\s*[x×*]\s+/i,
  /\s[x×*]\s*(\d{1,5})\s*$/i,
  /\b(?:qty|qte|quantit[eé]|quantity|nb|menge|cantidad)\s*[:=]?\s*(\d{1,5})\b/i,
  /\b(\d{1,5})\s*(?:pcs|pc|pieces|pièces|units|unités|unites|stk|uds)\b\.?/i,
];
const GRADE_IN_TEXT = /\b(?:grade|class|classe|cat|klasse|grado)\s*[:=]?\s*([a-e])\+?(?![a-z0-9])/i;

/** Pull a quantity and a grade out of free text, returning the text without them. */
export function extractInline(text: string): { text: string; quantity?: number; grade?: string } {
  let t = ` ${text} `;
  let quantity: number | undefined;
  for (const rx of QTY_IN_TEXT) {
    const m = t.match(rx);
    if (m) {
      quantity = Number(m[1]);
      t = t.replace(m[0], " ");
      break;
    }
  }
  let grade: string | undefined;
  const g = t.match(GRADE_IN_TEXT);
  if (g) {
    grade = g[1].toUpperCase();
    t = t.replace(g[0], " ");
  }
  return { text: t.replace(/\s*[-–|,;]\s*(?=[-–|,;]|$)/g, " ").replace(/\s+/g, " ").trim(), quantity, grade };
}

export function buildLines(table: Table, layout: Layout): RawLine[] {
  const idx = new Map(table.headers.map((h, i) => [h, i]));
  const col = (f: Field) => table.headers.filter((h) => layout.mapping[h] === f);
  const get = (row: string[], f: Field) =>
    col(f).map((h) => row[idx.get(h)!]).filter(Boolean).join(" ").trim() || undefined;
  const gradeCols = Object.entries(layout.gradeColumns);
  const structured = col("quantity").length + col("grade").length + gradeCols.length > 0;
  const lines: RawLine[] = [];

  table.rows.forEach((row, i) => {
    const model = get(row, "model");
    const description = get(row, "description");
    if (!model && !description) return;
    if (SKIP.test(model || description || "")) return;
    // Section titles ("LAPTOPS", "Smartphones") sit alone on their row in a table that otherwise has counts or grades.
    const filled = row.filter(Boolean).length;
    if (structured && filled === 1 && !/\d/.test(model || description || "") && matchLine({ row: 0, text: model || description!, quantity: 1 }).status === "unmatched") return;

    const inline = extractInline([model, description].filter(Boolean).join(" "));
    const base = {
      row: i + 1,
      brand: get(row, "brand"),
      model,
      cpu: get(row, "cpu"),
      ram: get(row, "ram"),
      storage: get(row, "storage"),
      serial: get(row, "serial"),
    };
    const brandInText = base.brand && normHeader(inline.text).includes(normHeader(base.brand));
    const text = [brandInText ? undefined : base.brand, inline.text, base.cpu, base.ram, base.storage].filter(Boolean).join(" ");

    if (gradeCols.length > 0) {
      // Pivot layout: one line per non-empty grade cell.
      for (const [header, grade] of gradeCols) {
        const n = parseQuantity(row[idx.get(header)!]);
        if (n) lines.push({ ...base, text, quantity: n, gradeRaw: grade });
      }
      return;
    }
    const qty = parseQuantity(get(row, "quantity")) ?? inline.quantity ?? 1;
    lines.push({ ...base, text, quantity: qty, gradeRaw: get(row, "grade") ?? inline.grade });
  });
  return lines;
}
