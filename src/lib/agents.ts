import type { AgentOffer, AgentResult, Grade, QuoteLine } from "@/types";
import { getRef } from "@/lib/catalog";
import { latestFor, loadTradeIn, monthLabel, tradeInKey } from "@/lib/tradein";

export const LEGACY_API = import.meta.env.VITE_API_URL || "http://localhost:3001";
/** Message of a result whose request never reached the backend (PricingStep tells the user to start it). */
export const BACKEND_DOWN = "Backend Nexus injoignable";

type Agent = {
  name: string;
  supports: (line: QuoteLine) => boolean;
  // onUpdate : premiers résultats à afficher pendant que l'agent continue
  run: (line: QuoteLine, onUpdate?: (results: AgentResult[]) => void) => Promise<AgentResult[]>;
};

const B2C_GRADE: Record<Grade, string> = { A: "parfait_etat", B: "tres_bon_etat", C: "bon_etat", D: "etat_correct", E: "etat_correct" };
type LegacyOffer = { prix?: number; price?: number; revendeur?: string; source?: string; url?: string; lien?: string };
const toOffers = (xs: LegacyOffer[] | undefined, fallback: string): AgentOffer[] =>
  (xs || []).map((o) => ({ source: o.revendeur || o.source || fallback, price: Number(o.prix ?? o.price), url: o.url || o.lien })).filter((o) => o.price > 0);

const MARKET = "Marché (Nexus API)";

/** Une demande au serveur de prix ; pending : des agents restent à relancer pour ce relevé (aCompleter). */
async function askMarket(line: QuoteLine, completer: boolean): Promise<{ results: AgentResult[]; pending: boolean }> {
  try {
    const res = await fetch(`${LEGACY_API}/api/market/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completer,
        devices: [
          line.category === "laptop" 
            ? {
                type: "laptops",
                titre: `${line.brand} ${line.model} ${line.variant.cpu || ""} ${line.variant.ram || ""} ${line.variant.storage || ""}`.trim().replace(/\s+/g, ' '),
                brand: line.brand,
                model: `${line.brand} ${line.model}`.replace(/\b(i[3579]-\w+)\b/gi, '').replace(/\b(ryzen\s+\d+\s+(pro\s+)?\w+)\b/gi, '').replace(/\b\d+\s*GB\b/gi, '').replace(/\s+/g, ' ').trim(),
                storage: (line.variant.storage || "0").replace(/[^0-9]/g, ""),
                // The backend's PC agents search "<model> <cpu> <ram>" (B2C-Backend relance.ts)
                cpu: line.variant.cpu,
                ram: line.variant.ram,
                color: "",
                grade: B2C_GRADE[line.grade]
              }
            : {
                type: "phones",
                titre: "",
                brand: line.brand.toLowerCase(),
                model: line.model,
                storage: (line.variant.storage || "").replace("GB", "").replace("TB", "000"),
                color: "",
                grade: B2C_GRADE[line.grade]
              }
        ]
      }),
    });
    if (!res.ok) return { pending: false, results: [{ agent: MARKET, kind: "buyback", status: "error", offers: [], message: `HTTP ${res.status}` }] };
    const responseBody = await res.json();

    const devices = [...(responseBody.knownDevices || []), ...(responseBody.newlyScrapedDevices || [])];
    const data = devices.length > 0 ? devices[0].price : null;

    const buy = toOffers(data?.offres, "Rachat");
    const sell = toOffers(data?.ventes, "Revente");
    return {
      pending: (responseBody.knownDevices?.[0]?.aCompleter?.length ?? 0) > 0,
      results: [
        { agent: MARKET, kind: "buyback", status: buy.length ? "ok" : "empty", offers: buy },
        { agent: MARKET, kind: "resale", status: sell.length ? "ok" : "empty", offers: sell },
      ],
    };
  } catch {
    return { pending: false, results: [{ agent: MARKET, kind: "buyback", status: "error", offers: [], message: BACKEND_DOWN }] };
  }
}

const nexusMarketAgent: Agent = {
  name: MARKET,
  supports: (l) => !!LEGACY_API && (l.category === "phone" || l.category === "laptop"),
  // Deux temps : le relevé de la semaine tout de suite (completer: false), puis, s'il lui
  // manque des agents (aCompleter), le même relevé complété par ces agents relancés sur le
  // serveur (completer: true), qui remplace le premier quand il arrive.
  async run(line, onUpdate) {
    const first = await askMarket(line, false);
    if (!first.pending || !onUpdate) return first.pending ? (await askMarket(line, true)).results : first.results;
    onUpdate(first.results);
    const full = await askMarket(line, true);
    return full.results.some((r) => r.status === "error") ? first.results : full.results;
  },
};

const catalogEstimate = (gradeCoef: Record<Grade, number>): Agent => ({
  name: "Estimation catalogue",
  supports: (l) => l.category === "phone" && !!getRef(l.refId)?.basePrice,
  async run(line) {
    const base = getRef(line.refId)!.basePrice!;
    return [{
      agent: this.name,
      kind: "estimate",
      status: "ok",
      offers: [{ source: "Référentiel Interne", price: Math.round(base * gradeCoef[line.grade]) }],
      message: "Estimation, pas un prix marché",
    }];
  },
});

const TRADE_IN = "Reprise (historique)";

/**
 * Tablets have no market agent on the server yet: the latest monthly trade-in price of the model and
 * capacity stands in for the competitors' buyback. Wi-Fi unless the line says cellular. The trade-in
 * price is for a device in good condition (grade B), scaled by the grade coefficients.
 */
const tradeInAgent = (gradeCoef: Record<Grade, number>): Agent => ({
  name: TRADE_IN,
  supports: (l) => l.category === "tablet" && !!l.refId,
  async run(line) {
    const ref = getRef(line.refId)!;
    const data = await loadTradeIn().catch(() => undefined);
    const model = data?.models[tradeInKey(ref.brand, ref.model)];
    const cellular = /\b(?:cellular|lte|4g|5g|wi-?fi\s*\+\s*cell)/i.test(line.sampleText);
    const variants = (model?.variants ?? []).filter((v) => !line.variant.storage || v.storage === line.variant.storage);
    const network = variants.filter((v) => (v.network === "Wi-Fi") !== cellular);
    const last = model && latestFor({ ...model, variants: network.length ? network : variants }, {});
    if (!data || !last) return [{ agent: TRADE_IN, kind: "buyback", status: "empty", offers: [] }];
    return [{
      agent: TRADE_IN,
      kind: "buyback",
      status: "ok",
      offers: [{ source: `Reprise ${data.market} · ${monthLabel(last.month)}`, price: Math.round(last.price * gradeCoef[line.grade] / gradeCoef.B) }],
      message: "Prix de reprise, pas un prix de revente",
    }];
  },
});

export function agentsFor(gradeCoef: Record<Grade, number>): Agent[] {
  return [nexusMarketAgent, catalogEstimate(gradeCoef), tradeInAgent(gradeCoef)];
}

/** onUpdate reçoit les résultats déjà connus de tous les agents quand l'un d'eux en livre une première partie. */
export async function runAgents(line: QuoteLine, agents: Agent[], onUpdate?: (results: AgentResult[]) => void): Promise<AgentResult[]> {
  const applicable = agents.filter((a) => a.supports(line));
  const parts: AgentResult[][] = applicable.map(() => []);
  const results = await Promise.all(applicable.map((a, i) =>
    a.run(line, onUpdate && ((partial) => { parts[i] = partial; onUpdate(parts.flat()); }))
      .then((r) => (parts[i] = r))));
  return results.flat();
}

export async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>, signal?: AbortSignal) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length && !signal?.aborted) await task(queue.shift()!);
  });
  await Promise.all(workers);
}
