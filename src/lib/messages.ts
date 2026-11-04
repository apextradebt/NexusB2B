import i18n from "@/i18n";
import type { Category } from "@/types";
import { DEFAULT_COSTS, type Country } from "@/lib/costs";
import { CATALOG } from "@/lib/catalog";

/**
 * Messages written in French by the matching and pricing code (warnings, price basis, source names…).
 * They are stored that way in saved quotes, so they are translated when shown, not when produced.
 * Each pattern's captures are translated in turn ("Revente marché − coûts − marge").
 */
const PATTERNS: [RegExp, string][] = [
  [/^CPU non renseigné$/, "cpu_missing"],
  [/^RAM non renseignée$/, "ram_missing"],
  [/^Stockage non renseigné$/, "storage_missing"],
  [/^CPU (.+) ambigu \((\d+) options\)$/, "cpu_ambiguous"],
  [/^CPU (.+) absent de la liste indicative$/, "cpu_not_listed"],
  [/^CPU (.+) jamais proposé sur (.+)$/, "cpu_never"],
  [/^RAM (.+) hors configurations d'usine$/, "ram_off"],
  [/^Stockage (.+) hors configurations d'usine$/, "storage_off"],
  [/^Aucun modèle du référentiel ne correspond$/, "no_model"],
  [/^Exclu manuellement$/, "excluded"],
  [/^Les règles proposaient (.+)$/, "rules_proposed"],
  [/^Identification par n° de série impossible : le backend Nexus ne répond pas$/, "serial_backend_down"],
  [/^N° de série non reconnu$/, "serial_unknown"],
  [/^IMEI non reconnu \(TAC (.+) absent de la base\)$/, "imei_unknown"],
  [/^N° de série Mac récent : limite d'identification du jour atteinte$/, "mac_quota"],
  [/^N° de série : (.+), absent du catalogue$/, "serial_not_in_catalog"],
  [/^IMEI : (.+), absent du catalogue$/, "imei_not_in_catalog"],
  [/^Le n° de série indique (.+)$/, "serial_says"],
  [/^(.+) − coûts − marge$/, "basis_costs_margin"],
  [/^(.+) \(inférieur à votre prix\)$/, "basis_below_yours"],
  [/^Revente marché$/, "basis_resale"],
  [/^Estimation catalogue$/, "catalog_estimate"],
  [/^Votre prix de vente$/, "basis_yours"],
  [/^Aligné sur le rachat concurrent \(pas de prix de revente trouvé\)$/, "basis_buyback"],
  [/^Prix saisi manuellement$/, "basis_manual"],
  [/^ajusté du grade (\w+)$/, "grade_adjusted"],
  [/^configuration du devis incomplète$/, "partial_config"],
  [/^Marché \(Nexus API\)$/, "market_agent"],
  [/^Référentiel Interne$/, "internal_reference"],
  [/^Estimation, pas un prix marché$/, "estimate_not_market"],
  [/^Reprise \(historique\)$/, "trade_in_agent"],
  [/^Reprise (.+)$/, "trade_in_source"],
  [/^Prix de reprise, pas un prix de revente$/, "trade_in_not_resale"],
  [/^Backend Nexus injoignable$/, "backend_down"],
  [/^le backend exige une connexion \(B2B_AUTH=optional pour le mode local\)$/, "backend_auth"],
];

/** A message from the code, in the interface language. Unknown text (model names, server messages) is kept. */
export function tm(text: string | undefined): string {
  if (!text || i18n.language === "fr") return text ?? "";
  // A list price note joins several of them: "ajusté du grade A, configuration du devis incomplète".
  if (text.includes(", ") && text.split(", ").every((p) => PATTERNS.some(([re]) => re.test(p)))) return text.split(", ").map(tm).join(", ");
  for (const [re, key] of PATTERNS) {
    const m = text.match(re);
    if (m) return i18n.t(`msg.${key}`, Object.fromEntries(m.slice(1).map((v, i) => [`p${i + 1}`, tm(v)])));
  }
  return text;
}

/** "PC", "Phone"… before a model name. */
export const kindLabel = (c: Category) => i18n.t(`kind.${c}`);

/** The whole catalogue as select options ("PC · Dell Latitude 5420"), after an empty choice. */
export const modelOptions = (empty: string) => [
  { value: "", label: empty },
  ...CATALOG.map((r) => ({ value: r.id, label: `${kindLabel(r.category)} · ${r.brand} ${r.model}` })),
];

// Country names and notes ship in French: shown in another language unless the user edited them.
// (Looked up lazily: costs.ts imports this module.)
const shipped = (code: string) => DEFAULT_COSTS.countries.find((x) => x.code === code);

export function countryName(c: Pick<Country, "code" | "name"> | undefined, code?: string): string {
  const cc = c?.code ?? code ?? "";
  const name = c?.name ?? cc;
  if (i18n.language === "fr" || (c && shipped(cc)?.name !== name)) return name;
  try {
    return new Intl.DisplayNames([i18n.language], { type: "region" }).of(cc) ?? name;
  } catch {
    return name;
  }
}

export function countryNote(c: Pick<Country, "code" | "note">): string | undefined {
  if (!c.note || i18n.language === "fr" || c.note !== shipped(c.code)?.note) return c.note;
  return i18n.exists(`levy_note.${c.code}`) ? i18n.t(`levy_note.${c.code}`) : c.note;
}

/** A Copie France capacity bracket ("> 32 Go ≤ 64 Go", "toutes capacités"). */
export function bracketText(s: string): string {
  if (i18n.language === "fr") return s;
  return s.replace("toutes capacités", i18n.t("costs.all_capacities")).replace(/\bGo\b/g, "GB").replace(/\bMo\b/g, "MB").replace(/\bTo\b/g, "TB");
}
