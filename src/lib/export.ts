import writeXlsxFile from "write-excel-file/browser";
import type { PriceListEntry, QuoteLine } from "@/types";
import { totals } from "@/lib/pricing";

const HEADERS = [
  "Catégorie", "Marque", "Modèle", "CPU", "RAM", "Stockage", "Grade", "Quantité",
  "Rachat marché (u.)", "Revente marché (u.)", "Votre prix de vente (u.)", "Prix de revente retenu (u.)", "Prix d'achat (u.)", "Marge (u.)",
  "Total achat", "Total revente", "Base de calcul", "Statut", "Lignes source", "Liens sources",
];

/** Every source price behind a line, with its listing links. */
function sourceRows(l: QuoteLine) {
  return l.agentResults
    .filter((r) => r.status === "ok" && r.kind !== "estimate")
    .flatMap((r) => r.offers.map((o) => ({ kind: r.kind === "buyback" ? "Rachat" : "Revente", source: o.source, price: o.price, note: r.message ?? "", links: o.links?.length ? o.links : o.url ? [o.url] : [] })));
}

function rowOf(l: QuoteLine) {
  const margin = l.sellPrice !== undefined && l.buyPrice !== undefined ? l.sellPrice - l.buyPrice : undefined;
  return [
    l.category === "laptop" ? "PC portable" : l.category === "phone" ? "Téléphone" : "Non reconnu",
    l.brand, l.model, l.variant.cpu ?? "", l.variant.ram ?? "", l.variant.storage ?? "", l.grade, l.quantity,
    l.marketBuy, l.marketSell, l.listPrice, l.sellPrice, l.buyPrice, margin,
    l.buyPrice !== undefined ? l.buyPrice * l.quantity : undefined,
    l.sellPrice !== undefined ? l.sellPrice * l.quantity : undefined,
    l.priceBasis ?? "", l.status, l.sourceRows.join(" "),
    sourceRows(l).map((r) => `${r.kind} ${r.source} ${r.price} € ${r.links[0] ?? ""}`).join(" | "),
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
  // Second sheet: one row per source and side, with clickable links to the listings.
  const sources = [
    ["Marque", "Modèle", "Configuration", "Grade", "Côté", "Source", "Prix (EUR)", "Détail", "Lien 1", "Lien 2", "Lien 3"].map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#EAE2D3" })),
    ...lines.flatMap((l) =>
      sourceRows(l).map((r) => [
        l.brand, l.model, [l.variant.cpu, l.variant.ram, l.variant.storage].filter(Boolean).join(" / "), l.grade, r.kind, r.source, r.price, r.note,
        ...[0, 1, 2].map((i) => (r.links[i] ? { value: `=HYPERLINK("${r.links[i].replace(/"/g, "%22")}","Voir l'offre")`, type: "Formula" as const } : null)),
      ])
    ),
  ];
  await writeXlsxFile(
    [
      { data: data as never, sheet: "Devis", columns: [14, 12, 28, 18, 8, 12, 8, 10, 16, 16, 18, 20, 16, 12, 14, 14, 44, 12, 18, 60].map((width) => ({ width })) },
      { data: sources as never, sheet: "Sources", columns: [10, 26, 26, 7, 9, 22, 10, 40, 14, 14, 14].map((width) => ({ width })) },
    ]
  ).toFile(`${name}.xlsx`);
}

/** The customer's price list as a CSV that re-imports as is (edit in Excel, import again). */
export function exportPriceList(list: PriceListEntry[]) {
  const rows = [
    ["Catégorie", "Marque", "Modèle", "Processeur", "RAM", "Stockage", "Grade", "Prix de vente (EUR)", "Mis à jour"],
    ...list.map((e) => [
      e.category === "laptop" ? "PC portable" : "Téléphone", e.brand, e.model, e.variant.cpu ?? "", e.variant.ram ?? "", e.variant.storage ?? "",
      e.grade ?? "", e.price, e.updatedAt.slice(0, 10),
    ]),
  ];
  const esc = (v: unknown) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  download(new Blob(["﻿" + rows.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" }), `mes-prix-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadPriceTemplate() {
  const csv = [
    "Marque;Modèle;Processeur;RAM;Stockage;Grade;Prix de vente",
    "Dell;Latitude 5420;i5-1145G7;16GB;256GB;A;449",
    "Dell;Latitude 5420;i5-1145G7;16GB;256GB;B;399",
    "HP;EliteBook 840 G8;;;;;420",
    "Apple;iPhone 13;;;128GB;A;519",
  ].join("\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "modele-prix-de-vente.csv");
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
