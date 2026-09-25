import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import type { ColumnMapping, Field, Grade, RawLine } from "@/types";
import { GRADES } from "@/types";

export type Table = { headers: string[]; rows: string[][] };

const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export const normHeader = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

// Header synonyms (FR + EN). Order matters: first match wins.
const SYNONYMS: [Field, string[]][] = [
  ["serial", ["serial", "serial number", "sn", "s n", "imei", "numero de serie", "n de serie", "service tag", "asset"]],
  ["quantity", ["qty", "quantity", "quantite", "qte", "nb", "nombre", "count", "units", "unites", "pcs"]],
  ["grade", ["grade", "class", "classe", "condition", "etat", "cosmetic", "cosmetique"]],
  ["brand", ["brand", "marque", "manufacturer", "fabricant", "make", "constructeur", "oem"]],
  ["cpu", ["cpu", "processor", "processeur", "proc"]],
  ["ram", ["ram", "memory", "memoire"]],
  ["storage", ["storage", "stockage", "ssd", "hdd", "disk", "disque", "capacity", "capacite", "rom"]],
  ["model", ["model", "modele", "device", "appareil", "product", "produit", "row labels", "etiquettes de lignes", "article", "reference", "ref", "name", "nom", "item"]],
  ["description", ["description", "designation", "libelle", "details", "spec", "specs", "configuration", "config"]],
];

export function guessField(header: string): Field {
  const h = normHeader(header);
  if (!h) return "ignore";
  for (const [field, words] of SYNONYMS) {
    if (words.some((w) => h === w || h.startsWith(w + " ") || h.endsWith(" " + w))) return field;
  }
  return "ignore";
}

/** "Class A", "Grade B", "A", "Grade A+" → grade letter; null when the header is not a grade label. */
export function gradeFromLabel(label: string): Grade | null {
  const h = normHeader(label);
  const m = h.match(/^(?:class|classe|grade|cat|categorie)?\s*([a-e])\+?$/);
  return m ? (m[1].toUpperCase() as Grade) : null;
}

/** Free-text grade value → A–E ("Grade A+", "Class B", "Très bon état", "Fair"…). */
export function parseGrade(raw?: string): Grade | undefined {
  if (!raw) return undefined;
  const g = gradeFromLabel(raw);
  if (g) return g;
  const h = normHeader(raw);
  if (/(parfait|excellent|like new|comme neuf|mint)/.test(h)) return "A";
  if (/(tres bon|very good)/.test(h)) return "B";
  if (/(bon|good)/.test(h)) return "C";
  if (/(correct|fair|moyen)/.test(h)) return "D";
  if (/(hs|broken|defect|casse|for parts|pour pieces)/.test(h)) return "E";
  const letter = h.match(/\b([a-e])\b/);
  return letter && GRADES.includes(letter[1].toUpperCase() as Grade) ? (letter[1].toUpperCase() as Grade) : undefined;
}

/**
 * Pick the header row: the one (among the first 20) whose cells look most like known column names.
 * Pivot exports start with title rows ("Count of Model", "Column Labels"), so row 0 is often wrong.
 */
function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, i) => {
    const filled = row.filter(Boolean);
    if (filled.length < 2) return;
    const score = filled.filter((c) => guessField(c) !== "ignore" || gradeFromLabel(c)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function toTable(matrix: string[][]): Table {
  const rows = matrix.map((r) => r.map(clean));
  const h = findHeaderRow(rows);
  const width = Math.max(...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => rows[h][i] || `Colonne ${i + 1}`);
  const body = rows.slice(h + 1).filter((r) => r.some(Boolean)).map((r) => headers.map((_, i) => r[i] ?? ""));
  return { headers, rows: body };
}

export async function readFile(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const sheets = await readXlsxFile(file);
    // Use the sheet with the most filled rows (pivot sheets often sit next to the raw export).
    const sheet = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a));
    return toTable(sheet.data.map((r) => r.map(clean)));
  }
  if (name.endsWith(".xls")) {
    throw new Error("Format .xls (Excel 97) non supporté : enregistrez le fichier en .xlsx ou .csv.");
  }
  return parseText(await file.text());
}

export function parseText(text: string): Table {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, delimiter: "" });
  return toTable(res.data);
}

export type Layout = { mapping: ColumnMapping; gradeColumns: Record<string, Grade> };

/** Auto-detect column roles, including pivot layouts where each grade is its own count column. */
export function detectLayout(table: Table): Layout {
  const mapping: ColumnMapping = {};
  const gradeColumns: Record<string, Grade> = {};
  const used = new Set<Field>();
  table.headers.forEach((header) => {
    const g = gradeFromLabel(header);
    const numeric = table.rows.slice(0, 30).every((r) => {
      const v = r[table.headers.indexOf(header)];
      return !v || !isNaN(Number(v.replace(",", ".")));
    });
    if (g && numeric) {
      gradeColumns[header] = g;
      mapping[header] = "ignore";
      return;
    }
    const f = guessField(header);
    // One column per field, except free text which can be combined.
    if (f !== "ignore" && f !== "description" && used.has(f)) {
      mapping[header] = "description";
      return;
    }
    mapping[header] = f;
    used.add(f);
  });
  // No explicit model column: fall back to the first text column.
  if (!Object.values(mapping).includes("model")) {
    const first = table.headers.find((h) => mapping[h] === "ignore" && !gradeColumns[h] && !/total|blank/i.test(h));
    if (first) mapping[first] = "model";
  }
  return { mapping, gradeColumns };
}

const SKIP = /^(grand total|total|\(blank\)|\(vide\)|-|—|sous-total|subtotal)$/i;

export function buildLines(table: Table, layout: Layout): RawLine[] {
  const col = (f: Field) => table.headers.filter((h) => layout.mapping[h] === f);
  const get = (row: string[], f: Field) =>
    col(f).map((h) => row[table.headers.indexOf(h)]).filter(Boolean).join(" ").trim() || undefined;
  const gradeCols = Object.entries(layout.gradeColumns);
  const lines: RawLine[] = [];

  table.rows.forEach((row, i) => {
    const model = get(row, "model");
    const description = get(row, "description");
    if (!model && !description) return;
    if (model && SKIP.test(model)) return;
    const base = {
      row: i + 1,
      brand: get(row, "brand"),
      model,
      cpu: get(row, "cpu"),
      ram: get(row, "ram"),
      storage: get(row, "storage"),
      serial: get(row, "serial"),
    };
    const text = [base.brand, model, description, base.cpu, base.ram, base.storage].filter(Boolean).join(" ");

    if (gradeCols.length > 0) {
      // Pivot layout: one line per non-empty grade cell.
      for (const [header, grade] of gradeCols) {
        const n = Number((row[table.headers.indexOf(header)] || "").replace(",", "."));
        if (n > 0) lines.push({ ...base, text, quantity: Math.round(n), gradeRaw: grade });
      }
      return;
    }
    const qty = Number((get(row, "quantity") || "1").replace(",", "."));
    lines.push({ ...base, text, quantity: qty > 0 ? Math.round(qty) : 1, gradeRaw: get(row, "grade") });
  });
  return lines;
}
