import writeXlsxFile from "write-excel-file/browser";
import type { QuoteLine } from "@/types";
import { totals } from "@/lib/pricing";

const HEADERS = [
  "Catégorie", "Marque", "Modèle", "CPU", "RAM", "Stockage", "Grade", "Quantité",
  "Rachat marché (u.)", "Prix de revente (u.)", "Prix d'achat (u.)", "Marge (u.)",
  "Total achat", "Total revente", "Base de calcul", "Statut", "Lignes source",
];

function rowOf(l: QuoteLine) {
  const margin = l.sellPrice !== undefined && l.buyPrice !== undefined ? l.sellPrice - l.buyPrice : undefined;
  return [
    l.category === "laptop" ? "PC portable" : l.category === "phone" ? "Téléphone" : "Non reconnu",
    l.brand, l.model, l.variant.cpu ?? "", l.variant.ram ?? "", l.variant.storage ?? "", l.grade, l.quantity,
    l.marketBuy, l.sellPrice, l.buyPrice, margin,
    l.buyPrice !== undefined ? l.buyPrice * l.quantity : undefined,
    l.sellPrice !== undefined ? l.sellPrice * l.quantity : undefined,
    l.priceBasis ?? "", l.status, l.sourceRows.join(" "),
  ];
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(lines: QuoteLine[], name: string) {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semicolon + BOM so French Excel opens it with the right columns and accents.
  const body = [HEADERS, ...lines.map(rowOf)].map((r) => r.map(esc).join(";")).join("\n");
  download(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
}

export async function exportXlsx(lines: QuoteLine[], name: string, meta: { client: string; reference: string }) {
  const t = totals(lines);
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const data = [
    [bold("Client"), meta.client || "—"],
    [bold("Référence"), meta.reference || "—"],
    [bold("Date"), new Date().toLocaleDateString("fr-FR")],
    [bold("Unités"), t.units],
    [bold("Total achat (EUR)"), t.buy],
    [bold("Total revente (EUR)"), t.sell],
    [bold("Marge brute (EUR)"), t.margin],
    [],
    HEADERS.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#EAE2D3" })),
    ...lines.map((l) => rowOf(l).map((v) => (v === undefined ? null : v))),
  ];
  await writeXlsxFile(data as never, {
    columns: [14, 12, 28, 18, 8, 12, 8, 10, 16, 18, 16, 12, 14, 14, 44, 12, 18].map((width) => ({ width })),
  }).toFile(`${name}.xlsx`);
}

export function downloadTemplate() {
  const csv = [
    "Numéro de série;Marque;Modèle;Processeur;RAM;Stockage;Grade;Quantité",
    "ABC123;Dell;Latitude 5420;i5-1145G7;16GB;256GB SSD;B;1",
    "ABC124;HP;EliteBook 840 G8;i5-1135G7;8GB;256GB SSD;C;1",
    "ABC125;Lenovo;ThinkPad T14 Gen 2;Ryzen 5 PRO 5650U;16GB;512GB SSD;A;1",
    ";Apple;iPhone 13;;;128GB;B;25",
  ].join("\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "modele-import-b2b.csv");
}
