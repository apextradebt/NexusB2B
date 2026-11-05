import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import { backendFetch } from "@/lib/api";

// The price list the shops (Nexus Back) quote from: buy prices go to them, sell prices stay here.
// Separate from "Mes prix", which feeds this app's own B2B quotes. A price file comes in two layouts:
//  - one column per grade: Modèle | Stockage | Rachat A | Rachat B | Vente A | Vente B…
//  - one row per grade:    Modèle | Stockage | Grade | Prix de rachat | Prix de vente
// A column that doesn't say buy or sell ("Grade A", "Prix") follows the import button used.

export const SHOP_GRADES = ["A", "B", "C", "D"] as const;
export type ShopGrade = typeof SHOP_GRADES[number];
export type GradePrices = Partial<Record<ShopGrade, number>>;
export type PriceSide = "buy" | "sell";

export type ShopPriceRow = { category: "phone" | "laptop"; brand: string; model: string; storage: string; buy: GradePrices; sell: GradePrices };

/** `key` is translated under shop_prices.issue; `line` is the row in the file. */
export type PriceIssue = { line: number; key: string; values?: Record<string, string> };
export type ParsedPrices = { rows: ShopPriceRow[]; issues: PriceIssue[] };

const fold = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const BRAND = ["marque", "brand", "fabricant", "manufacturer", "constructeur"];
const MODEL = ["modele", "model", "appareil", "device", "designation", "produit", "product", "reference"];
const CATEGORY = ["categorie", "category", "type", "famille"];
const STORAGE = ["stockage", "capacite", "capacity", "storage", "memoire"];
const GRADE = ["grade", "etat", "condition"];
const BUY_WORDS = ["rachat", "reprise", "buy", "buyback", "purchase", "achat", "tradein"];
const SELL_WORDS = ["vente", "revente", "sell", "sale", "resale"];
const PRICE_WORDS = ["prix", "price", "tarif", "montant", "amount"];

type Columns = {
  brand: number; model: number; category: number; storage: number; grade: number;
  prices: { index: number; side: PriceSide; grade: ShopGrade | null }[];
};

function priceColumn(header: string, side: PriceSide) {
  const words = header.split(" ");
  const has = (list: string[]) => words.some((w) => list.includes(w));
  const letter = words.find((w) => w.length === 1 && "abcd".includes(w));
  const grade = letter ? (letter.toUpperCase() as ShopGrade) : null;
  if (has(BUY_WORDS)) return { side: "buy" as const, grade };
  if (has(SELL_WORDS)) return { side: "sell" as const, grade };
  if (grade || has(PRICE_WORDS)) return { side, grade };
  return null;
}

function findColumns(headers: string[], side: PriceSide): Columns | null {
  const exact = (list: string[]) => headers.findIndex((h) => list.includes(h) || h.split(" ").some((w) => list.includes(w)));
  const model = exact(MODEL);
  if (model < 0) return null;
  const columns: Columns = {
    brand: exact(BRAND), model, category: exact(CATEGORY), storage: exact(STORAGE),
    grade: headers.findIndex((h) => GRADE.includes(h)),
    prices: [],
  };
  const taken = new Set([columns.brand, columns.model, columns.category, columns.storage, columns.grade]);
  headers.forEach((h, index) => {
    if (taken.has(index) || !h) return;
    const price = priceColumn(h, side);
    if (price) columns.prices.push({ index, ...price });
  });
  return columns.prices.length > 0 ? columns : null;
}

const category = (v: unknown): ShopPriceRow["category"] | null => {
  const s = fold(v);
  if (!s || /phone|telephone|mobile|smartphone|tablet|tablette/.test(s)) return "phone";
  if (/laptop|portable|pc|ordinateur|computer|notebook|macbook/.test(s)) return "laptop";
  return null;
};

/** Same rule as the backend: "128 Go", "128gb" and "128" are 128GB; "1 To" is 1TB. */
export function normalizeStorage(v: string): string {
  const raw = v.trim().replace(/\s+/g, " ");
  const m = raw.toUpperCase().replace(/\s+/g, "").match(/^(\d+)(GO|GB|G|TO|TB|T)?$/);
  if (!m) return raw;
  if (m[2]) return `${m[1]}${m[2].startsWith("T") ? "TB" : "GB"}`;
  return Number(m[1]) >= 16 ? `${m[1]}GB` : raw;
}

/**
 * "1 200,50 €", "1.200,50" and "1,200.50" are 1200.5; an empty cell or a dash is no price. The last
 * separator is decimal when one or two digits follow it, otherwise thousands ("1.200" is 1200).
 */
export function parseAmount(v: unknown): number | null | "invalid" {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : "invalid";
  const s = String(v ?? "").trim();
  if (!s || /^(-+|n\/?a|nc)$/i.test(s)) return null;
  const cleaned = s.replace(/[€\s  ]/g, "").replace(/eur$/i, "");
  if (!/^\d+([.,]\d{3})*([.,]\d{0,2})?$/.test(cleaned)) return "invalid";
  const last = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  const decimals = last >= 0 && cleaned.length - last - 1 <= 2 ? cleaned.slice(last + 1) : "";
  const whole = (decimals || last === cleaned.length - 1 ? cleaned.slice(0, last) : cleaned).replace(/[.,]/g, "");
  return Number(decimals ? `${whole}.${decimals}` : whole);
}

const gradeOf = (v: unknown): ShopGrade | null => {
  const g = fold(v).replace(/^grade /, "").toUpperCase();
  return (SHOP_GRADES as readonly string[]).includes(g) ? (g as ShopGrade) : null;
};

export function parsePriceTable(table: unknown[][], side: PriceSide): ParsedPrices {
  const headerAt = table.slice(0, 15).findIndex((r) => findColumns(r.map(fold), side));
  if (headerAt < 0) return { rows: [], issues: [{ line: 1, key: "no_columns" }] };
  const columns = findColumns(table[headerAt].map(fold), side)!;
  if (columns.prices.some((p) => !p.grade) && columns.grade < 0) return { rows: [], issues: [{ line: headerAt + 1, key: "no_grade" }] };

  const rows = new Map<string, ShopPriceRow>();
  const issues: PriceIssue[] = [];

  table.slice(headerAt + 1).forEach((cells, i) => {
    const line = headerAt + i + 2;
    const cell = (index: number) => (index >= 0 ? cells[index] : undefined);
    const model = String(cell(columns.model) ?? "").trim().replace(/\s+/g, " ");
    if (!model) return;

    const kind = category(cell(columns.category));
    if (!kind) {
      issues.push({ line, key: "bad_category", values: { model, value: String(cell(columns.category)) } });
      return;
    }
    const storage = normalizeStorage(String(cell(columns.storage) ?? ""));
    const key = `${kind}|${model.toLowerCase()}|${storage}`;
    const row = rows.get(key) ?? { category: kind, brand: String(cell(columns.brand) ?? "").trim(), model, storage, buy: {}, sell: {} };

    // A doubtful line is dropped whole: half a price list must not go out.
    const prices: { side: PriceSide; grade: ShopGrade; price: number }[] = [];
    for (const p of columns.prices) {
      const grade = p.grade ?? gradeOf(cell(columns.grade));
      if (!grade) {
        issues.push({ line, key: "bad_grade", values: { model, value: String(cell(columns.grade) ?? "") } });
        return;
      }
      const price = parseAmount(cell(p.index));
      if (price === "invalid") {
        issues.push({ line, key: "bad_price", values: { model, value: String(cell(p.index)) } });
        return;
      }
      if (price === null) continue;
      if (row[p.side][grade] !== undefined) {
        issues.push({ line, key: "duplicate", values: { model, grade } });
        return;
      }
      prices.push({ side: p.side, grade, price });
    }
    if (prices.length === 0) return;
    for (const p of prices) row[p.side][p.grade] = p.price;
    rows.set(key, row);
  });

  return { rows: [...rows.values()], issues };
}

function decode(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export async function readPriceFile(file: File, side: PriceSide): Promise<ParsedPrices> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) return { rows: [], issues: [{ line: 1, key: "old_excel" }] };
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const sheets = await readXlsxFile(file);
    // The fullest sheet: price lists often sit next to a cover page.
    const sheet = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a));
    return parsePriceTable(sheet.data as unknown[][], side);
  }
  const text = decode(await file.arrayBuffer()).replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter: "", delimitersToGuess: [";", ",", "\t", "|"] });
  return parsePriceTable(parsed.data, side);
}

const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The list in import format (semicolons and a BOM for French Excel): template or export. */
export function priceRowsToCsv(rows: ShopPriceRow[]) {
  const header = ["Marque", "Modèle", "Catégorie", "Stockage", ...SHOP_GRADES.map((g) => `Rachat ${g}`), ...SHOP_GRADES.map((g) => `Vente ${g}`)];
  const lines = rows.map((r) => [
    r.brand, r.model, r.category === "laptop" ? "PC" : "Téléphone", r.storage,
    ...SHOP_GRADES.map((g) => r.buy[g]), ...SHOP_GRADES.map((g) => r.sell[g]),
  ].map(csvCell).join(";"));
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Share of the sell price offered in the demo list. A placeholder, not a pricing rule. */
const DEMO_BUY_RATE = 0.7;

/** A ready-made list from the demo resale prices, to show the shops without a real price file. */
export async function demoShopPrices(): Promise<ShopPriceRow[]> {
  // A glob, not an import: the data file stays out of the repository and the app must build without it.
  const load = Object.values(import.meta.glob("/src/data/demo-prices.json", { import: "default" }))[0];
  if (!load) throw new Error("demo-prices.json is missing");
  const { prices } = (await load()) as { prices: { c: string; b: string; m: string; s?: string; p: number[] }[] };
  const rows = new Map<string, ShopPriceRow>();
  for (const d of prices) {
    if (d.c !== "phone" && d.c !== "laptop") continue;
    const sell: GradePrices = {};
    const buy: GradePrices = {};
    SHOP_GRADES.forEach((g, i) => {
      if (!d.p[i]) return;
      sell[g] = d.p[i];
      buy[g] = Math.max(5, Math.round((d.p[i] * DEMO_BUY_RATE) / 5) * 5);
    });
    const row = { category: d.c as ShopPriceRow["category"], brand: d.b, model: d.m, storage: normalizeStorage(d.s ?? ""), buy, sell };
    rows.set(`${row.category}|${row.model.toLowerCase()}|${row.storage}`, row);
  }
  return [...rows.values()];
}

export type PriceChange = { label: string; side: PriceSide; grade: string; from: number | null; to: number | null };
export type ImportSummary = {
  added: number; changed: number; removed: number; missing: number; unchanged: number;
  buyChanged: boolean; changes: PriceChange[]; negativeMargins: string[];
};
export type PriceVersion = { version: number; rowCount: number; fileName: string; publishedAt: string; publishedBy: string };
export type ShopPricing = { company: string; rows: ShopPriceRow[]; version: number | null; history: PriceVersion[] };
export type ImportRequest = { rows: ShopPriceRow[]; removeMissing: boolean; fileName: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await backendFetch(path, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

const IMPORT = "/api/backoffice/pricing/import";

export const previewImport = (input: ImportRequest) =>
  call<{ summary: ImportSummary; rowCount: number }>(IMPORT, { method: "POST", body: JSON.stringify({ ...input, dryRun: true }) });

export const publishImport = (input: ImportRequest) =>
  call<{ published: PriceVersion }>(IMPORT, { method: "POST", body: JSON.stringify(input) }).then((r) => r.published);

export const restoreVersion = (version: number) => call(`/api/backoffice/pricing/${version}/restore`, { method: "POST" });

export function useShopPricing() {
  const [pricing, setPricing] = useState<ShopPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPricing(await call<ShopPricing>("/api/backoffice/pricing"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { pricing, loading, error, reload };
}
