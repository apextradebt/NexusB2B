import type { AgentResult, PricingSettings, QuoteLine } from "@/types";

export const DEFAULT_SETTINGS: PricingSettings = {
  targetMarginPct: 25,
  // Refurbishment + logistics cost per unit (EUR), by category and grade. Starting values — tune in Settings.
  refurbCost: {
    phone: { A: 10, B: 20, C: 35, D: 55, E: 80 },
    laptop: { A: 25, B: 40, C: 60, D: 90, E: 130 },
  },
  gradeCoef: { A: 1, B: 0.85, C: 0.7, D: 0.5, E: 0.3 },
  defaultGrade: "C",
  agentConcurrency: 3,
};

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};

const offersOf = (results: AgentResult[], kind: AgentResult["kind"]) =>
  results.filter((r) => r.kind === kind && r.status === "ok").flatMap((r) => r.offers.map((o) => o.price)).filter((p) => p > 0);

/**
 * Turn agent results into unit prices.
 * - Sell price: median of resale offers found by the agents, else the catalog estimate.
 * - Buy price (our offer): sell × (1 − target margin) − refurbishment cost; if we only know
 *   competitors' buyback prices, we align on their median. A manual override always wins.
 */
export function priceLine(line: QuoteLine, s: PricingSettings): QuoteLine {
  const marketBuy = median(offersOf(line.agentResults, "buyback"));
  const resale = median(offersOf(line.agentResults, "resale"));
  const estimate = median(offersOf(line.agentResults, "estimate"));
  const sellPrice = resale ?? estimate;

  let buyPrice: number | undefined;
  let priceBasis: string | undefined;
  if (sellPrice !== undefined && line.category) {
    const refurb = s.refurbCost[line.category][line.grade];
    buyPrice = Math.max(0, Math.round(sellPrice * (1 - s.targetMarginPct / 100) - refurb));
    priceBasis = resale !== undefined ? "Revente marché − marge − reconditionnement" : "Estimation catalogue − marge − reconditionnement";
  } else if (marketBuy !== undefined) {
    buyPrice = marketBuy;
    priceBasis = "Aligné sur le rachat concurrent (pas de prix de revente trouvé)";
  }
  if (line.buyOverride !== undefined) {
    buyPrice = line.buyOverride;
    priceBasis = "Prix saisi manuellement";
  }
  return { ...line, marketBuy, sellPrice, buyPrice, priceBasis };
}

export function totals(lines: QuoteLine[]) {
  let units = 0, buy = 0, sell = 0, priced = 0;
  for (const l of lines) {
    units += l.quantity;
    if (l.buyPrice !== undefined && l.sellPrice !== undefined) {
      buy += l.buyPrice * l.quantity;
      sell += l.sellPrice * l.quantity;
      priced += l.quantity;
    } else if (l.buyPrice !== undefined) {
      buy += l.buyPrice * l.quantity;
    }
  }
  return { units, priced, buy, sell, margin: sell - buy };
}

export const eur = (n?: number) =>
  n === undefined ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
