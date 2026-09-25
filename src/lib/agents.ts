import type { AgentOffer, AgentResult, Grade, QuoteLine } from "@/types";
import { getRef } from "@/lib/catalog";

/** Price agents server (server/ in this repo, `npm run server`). */
const PRICE_API = import.meta.env.VITE_PRICE_API_URL || "http://localhost:8787";
/** Optional: the PhoneP2C (B2C) backend's phone scraper, used as one more phone source when configured. */
const LEGACY_API = import.meta.env.VITE_API_URL;

type Agent = {
  name: string;
  supports: (line: QuoteLine) => boolean;
  run: (line: QuoteLine, token?: string) => Promise<AgentResult[]>;
};

type ServerPrice = { source: string; sourceName: string; country: string; kind: "buyback" | "resale"; price: number; min: number; max: number; count: number; grade?: Grade; url: string; urls?: string[]; note?: string };
type ServerReport = { id: string; name: string; country: string; kinds: ("buyback" | "resale")[]; status: "ok" | "empty" | "blocked" | "robots" | "error" | "not_applicable"; message?: string };

const STATUS_MESSAGE: Record<string, string> = {
  empty: "Appareil introuvable sur ce site",
  blocked: "Site protégé contre les robots",
  robots: "Accès interdit par robots.txt",
};

/**
 * One call per quote line; the server runs every source in parallel (robots.txt respected,
 * one request per second per site, results cached 6 h) and returns one price per source and side.
 */
const priceServer: Agent = {
  name: "Agents de prix",
  supports: (l) => !!l.category,
  async run(line, token) {
    let data: { prices: ServerPrice[]; sources: ServerReport[] };
    try {
      const res = await fetch(`${PRICE_API}/api/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          category: line.category,
          brand: line.brand,
          model: line.model,
          cpu: line.variant.cpu,
          ram: line.variant.ram,
          storage: line.variant.storage,
          grade: line.grade,
        }),
      });
      if (!res.ok) return [{ agent: this.name, kind: "resale", status: "error", offers: [], message: `Serveur de prix : HTTP ${res.status}` }];
      data = await res.json();
    } catch {
      return [{ agent: this.name, kind: "resale", status: "error", offers: [], message: `Serveur de prix injoignable (${PRICE_API}) — lancez « npm run server »` }];
    }

    const results: AgentResult[] = data.prices.map((p) => ({
      agent: `${p.sourceName}`,
      kind: p.kind,
      status: "ok",
      offers: [{ source: `${p.sourceName} (${p.country})`, price: p.price, url: p.url, links: p.urls?.length ? p.urls : [p.url], grade: p.grade !== line.grade ? p.grade : undefined }],
      message: [
        p.count > 1 ? `médiane de ${p.count} offres (${p.min}–${p.max} €)` : undefined,
        p.note,
      ].filter(Boolean).join(" · ") || undefined,
    }));
    // Sources that answered nothing still appear, so coverage is visible.
    for (const s of data.sources) {
      if (s.status === "ok" || s.status === "not_applicable") continue;
      results.push({
        agent: s.name,
        kind: s.kinds.includes("buyback") && !s.kinds.includes("resale") ? "buyback" : "resale",
        status: s.status === "empty" ? "empty" : s.status === "error" ? "error" : "unavailable",
        offers: [],
        message: STATUS_MESSAGE[s.status] ?? s.message,
      });
    }
    return results;
  },
};

const B2C_GRADE: Record<Grade, string> = { A: "parfait_etat", B: "tres_bon_etat", C: "bon_etat", D: "etat_correct", E: "etat_correct" };
type LegacyOffer = { prix?: number; price?: number; revendeur?: string; source?: string; url?: string };
const toOffers = (xs: LegacyOffer[] | undefined, fallback: string): AgentOffer[] =>
  (xs || []).map((o) => ({ source: o.revendeur || o.source || fallback, price: Number(o.prix ?? o.price), url: o.url })).filter((o) => o.price > 0);

/** The B2C app's phone endpoint, only when VITE_API_URL points to that backend. */
const legacyPhoneMarket: Agent = {
  name: "Marché téléphones (B2C)",
  supports: (l) => !!LEGACY_API && l.category === "phone",
  async run(line, token) {
    try {
      const res = await fetch(`${LEGACY_API}/api/market/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          marque: line.brand.toLowerCase(),
          modele: line.model,
          couleur: "",
          capacite: (line.variant.storage || "").replace("GB", "").replace("TB", "000"),
          grade: B2C_GRADE[line.grade],
        }),
      });
      if (!res.ok) return [{ agent: this.name, kind: "buyback", status: "error", offers: [], message: `HTTP ${res.status}` }];
      const data = await res.json();
      const buy = toOffers(data?.resultats?.offres, "Rachat");
      const sell = toOffers(data?.ventes?.offres, "Revente");
      return [
        { agent: this.name, kind: "buyback", status: buy.length ? "ok" : "empty", offers: buy },
        { agent: this.name, kind: "resale", status: sell.length ? "ok" : "empty", offers: sell },
      ];
    } catch {
      return [{ agent: this.name, kind: "buyback", status: "error", offers: [], message: "Backend B2C injoignable" }];
    }
  },
};

/** Fallback for phones: B2C reference price × grade coefficient. Only used when no agent finds a resale price. */
const catalogEstimate = (gradeCoef: Record<Grade, number>): Agent => ({
  name: "Estimation catalogue",
  supports: (l) => l.category === "phone" && !!getRef(l.refId)?.basePrice,
  async run(line) {
    const base = getRef(line.refId)!.basePrice!;
    return [{
      agent: this.name,
      kind: "estimate",
      status: "ok",
      offers: [{ source: "Référentiel B2C", price: Math.round(base * gradeCoef[line.grade]) }],
      message: "Estimation, pas un prix marché",
    }];
  },
});

export function agentsFor(gradeCoef: Record<Grade, number>): Agent[] {
  return [priceServer, legacyPhoneMarket, catalogEstimate(gradeCoef)];
}

export async function runAgents(line: QuoteLine, agents: Agent[], token?: string): Promise<AgentResult[]> {
  const applicable = agents.filter((a) => a.supports(line));
  const results = await Promise.all(applicable.map((a) => a.run(line, token)));
  return results.flat();
}

/** Run `task` over `items` with at most `limit` in flight. */
export async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>, signal?: AbortSignal) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length && !signal?.aborted) await task(queue.shift()!);
  });
  await Promise.all(workers);
}
