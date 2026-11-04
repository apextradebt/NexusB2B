import type { AgentResult, Category, Grade, PriceListEntry, PricingSettings, QuoteLine } from "@/types";
import { findListPrice } from "@/lib/priceList";
import { buyForNet, costBreakdown, DEFAULT_COSTS, palletsFor, type CostBreakdown, type CostCategory, type CostInput, type CostItem, type Route } from "@/lib/costs";

export const DEFAULT_SETTINGS: PricingSettings = {
  targetMarginPct: 25,
  // Refurbishment + logistics cost per unit (EUR), by category and grade. Starting values — tune in Settings.
  refurbCost: {
    phone: { A: 10, B: 20, C: 35, D: 55, E: 80 },
    laptop: { A: 25, B: 40, C: 60, D: 90, E: 130 },
    tablet: { A: 15, B: 30, C: 45, D: 70, E: 100 },
  },
  gradeCoef: { A: 1, B: 0.85, C: 0.7, D: 0.5, E: 0.3 },
  defaultGrade: "C",
  agentConcurrency: 3,
  listPriceMode: "mine",
  aiMatching: true,
  shareCorrections: true,
  // Un lot d'entreprise est facturé avec TVA récupérable : régime normal. La marge cible couvre
  // déjà la vente, d'où commission et retours à 0 par défaut.
  costs: { ...DEFAULT_COSTS, supplier: "business", vatScheme: "normal", commissionPct: 0, returnsPct: 0 },
};

/** Le trajet par défaut d'un devis : celui des réglages. */
export const defaultRoute = (s: PricingSettings): Route => ({
  buyFrom: s.costs.buyFrom, sellTo: s.costs.sellTo, vatScheme: s.costs.vatScheme, supplier: s.costs.supplier, channel: s.costs.channel,
});

/** Une montre voyage et se taxe comme un téléphone. */
export const costCategory = (c: Category): CostCategory => (c === "watch" ? "phone" : c);

/** Taille du lot et nombre de palettes, d'après les lignes chiffrables du devis. */
export function lotSize(s: PricingSettings, lines: QuoteLine[]): { lotUnits: number; lotPallets: number } {
  const items = lines.filter((l) => l.category && l.refId && l.status !== "unmatched").map((l) => ({ category: costCategory(l.category!), quantity: l.quantity }));
  return { lotUnits: items.reduce((a, i) => a + i.quantity, 0), lotPallets: palletsFor(s.costs, items) };
}

/** Ce que le devis sait du lot : trajet et nombre d'appareils (pour répartir les forfaits par envoi). */
export type QuoteContext = { route: Route; lotUnits: number; lotPallets?: number };

/** Refurbishment cost per unit. Quotes hold phones, laptops and tablets; any other category costs nothing here. */
export const refurbCostFor = (s: PricingSettings, category: Category, grade: Grade) =>
  category === "watch" ? 0 : s.refurbCost[category]?.[grade] ?? 0;

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};

const offersOf = (results: AgentResult[], kind: AgentResult["kind"]) =>
  results.filter((r) => r.kind === kind && r.status === "ok").flatMap((r) => r.offers.map((o) => o.price)).filter((p) => p > 0);

/**
 * Turn agent results and the customer's price list into unit prices.
 * - Sell price: the customer's own selling price when the price list has one ("prudent" mode: the
 *   lower of it and the market), else the median of resale offers, else the catalog estimate.
 * - Buy price (our offer): the price that leaves the target margin (share of the sell price) once
 *   refurbishment, transport, private copy levy, duties, fees and VAT are paid (costs.ts); if we
 *   only know competitors' buyback prices, we align on their median. A manual override always wins.
 * - Without a context, the route of the settings and no per-shipment fees.
 */
export function priceLine(line: QuoteLine, s: PricingSettings, list: PriceListEntry[] = [], ctx?: QuoteContext): QuoteLine {
  const marketBuy = median(offersOf(line.agentResults, "buyback"));
  const resale = median(offersOf(line.agentResults, "resale"));
  const estimate = median(offersOf(line.agentResults, "estimate"));
  const mine = findListPrice(line, list, s.gradeCoef);
  const market = resale ?? estimate;

  let sellPrice = market;
  let basis = resale !== undefined ? "Revente marché" : "Estimation catalogue";
  if (mine) {
    const prudent = s.listPriceMode === "prudent" && market !== undefined && market < mine.price;
    sellPrice = prudent ? market : mine.price;
    basis = prudent ? `${basis} (inférieur à votre prix)` : "Votre prix de vente";
  }

  const route = ctx?.route ?? defaultRoute(s);
  const input: CostInput | undefined = sellPrice !== undefined && line.category
    ? { category: costCategory(line.category), storage: line.variant.storage, sell: sellPrice, refurb: refurbCostFor(s, line.category, line.grade), lotUnits: ctx?.lotUnits ?? 0, lotPallets: ctx?.lotPallets }
    : undefined;

  let buyPrice: number | undefined;
  let priceBasis: string | undefined;
  if (input) {
    buyPrice = buyForNet(s.costs, route, input, input.sell * s.targetMarginPct / 100);
    priceBasis = `${basis} − coûts − marge`;
  } else if (marketBuy !== undefined) {
    buyPrice = marketBuy;
    priceBasis = "Aligné sur le rachat concurrent (pas de prix de revente trouvé)";
  }
  if (line.buyOverride !== undefined) {
    buyPrice = line.buyOverride;
    priceBasis = "Prix saisi manuellement";
  }
  const costs = input && buyPrice !== undefined ? costBreakdown(s.costs, route, input, buyPrice) : undefined;
  const netMargin = costs && sellPrice !== undefined && buyPrice !== undefined ? Math.round(sellPrice - buyPrice - costs.total) : undefined;
  return { ...line, marketBuy, sellPrice, buyPrice, priceBasis, listPrice: mine?.price, listPriceNote: mine?.note, marketSell: market, costs, netMargin };
}

/** Gap between the customer's price and the market, when both are known (e.g. +0.18 = 18 % above market). */
export function marketGap(l: QuoteLine): number | undefined {
  if (l.listPrice === undefined || l.marketSell === undefined || l.marketSell === 0) return undefined;
  return (l.listPrice - l.marketSell) / l.marketSell;
}

/** Gap between our buy price and what buyback sites pay (e.g. -0.2 = we offer 20 % less than the market). */
export function buyGap(l: QuoteLine): number | undefined {
  if (l.buyPrice === undefined || !l.marketBuy) return undefined;
  return (l.buyPrice - l.marketBuy) / l.marketBuy;
}

/** From this far from the market (share of it), one of our prices is flagged. */
export const MARKET_GAP = 0.15;
export type MarketVerdict = "high" | "low" | "ok";

/** Is a price too high or too low against the market? Works on the shown percentage, so "15 %" is always flagged. */
export function marketVerdict(gap: number): MarketVerdict {
  const pct = Math.round(gap * 100);
  const limit = MARKET_GAP * 100;
  return pct >= limit ? "high" : pct <= -limit ? "low" : "ok";
}

/** The two families of costs the quote shows: what goes to the State, and what it takes to prepare and deliver. */
export const TAX_ITEMS: CostItem[] = ["vat", "levy", "eco", "duty"];
export const SERVICE_ITEMS: CostItem[] = ["refurb", "handling", "inbound", "outbound", "fees"];

/** Both families in whole euros, adding up exactly to the rounded total shown in the quote. */
export function costSplit(c: CostBreakdown): { taxes: number; other: number } {
  const taxes = Math.round(TAX_ITEMS.reduce((a, k) => a + (c.items[k] ?? 0), 0));
  return { taxes, other: Math.round(c.total) - taxes };
}

/** Margin per unit: net of every cost when known, else sell − buy. */
export function unitMargin(l: QuoteLine): number | undefined {
  if (l.sellPrice === undefined || l.buyPrice === undefined) return undefined;
  return l.netMargin ?? l.sellPrice - l.buyPrice;
}

/** Net margin on the sell price, as a share (0.25 = 25 %). */
export function marginRate(l: QuoteLine): number | undefined {
  const m = unitMargin(l);
  if (m === undefined || !l.sellPrice) return undefined;
  return m / l.sellPrice;
}

export function totals(lines: QuoteLine[]) {
  let units = 0, buy = 0, sell = 0, priced = 0, margin = 0, costs = 0;
  for (const l of lines) {
    units += l.quantity;
    if (l.buyPrice !== undefined && l.sellPrice !== undefined) {
      buy += l.buyPrice * l.quantity;
      sell += l.sellPrice * l.quantity;
      margin += unitMargin(l)! * l.quantity;
      costs += (l.costs?.total ?? 0) * l.quantity;
      priced += l.quantity;
    } else if (l.buyPrice !== undefined) {
      buy += l.buyPrice * l.quantity;
    }
  }
  return { units, priced, buy, sell, margin: Math.round(margin), costs: Math.round(costs) };
}

export const eur = (n?: number) =>
  n === undefined ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
