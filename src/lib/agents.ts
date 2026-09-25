import type { AgentOffer, AgentResult, Grade, QuoteLine } from "@/types";
import { getRef } from "@/lib/catalog";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type Agent = {
  name: string;
  supports: (line: QuoteLine) => boolean;
  run: (line: QuoteLine, token?: string) => Promise<AgentResult[]>;
};

const B2C_GRADE: Record<Grade, string> = {
  A: "parfait_etat",
  B: "tres_bon_etat",
  C: "bon_etat",
  D: "etat_correct",
  E: "etat_correct",
};

type RawOffer = { prix?: number; price?: number; revendeur?: string; source?: string; url?: string };
const toOffers = (xs: RawOffer[] | undefined, fallback: string): AgentOffer[] =>
  (xs || [])
    .map((o) => ({ source: o.revendeur || o.source || fallback, price: Number(o.prix ?? o.price), url: o.url }))
    .filter((o) => o.price > 0);

async function post(path: string, body: unknown, token?: string) {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const unreachable = (agent: string, kind: AgentResult["kind"]): AgentResult => ({
  agent, kind, status: "error", offers: [], message: "Backend injoignable",
});

/** Phones: the scraping endpoint already used by the B2C quote flow (buyback offers + resale offers in one call). */
const phoneMarket: Agent = {
  name: "Marché téléphones",
  supports: (l) => l.category === "phone",
  async run(line, token) {
    try {
      const res = await post("/api/market/prices", {
        marque: line.brand.toLowerCase(),
        modele: line.model,
        couleur: "",
        capacite: (line.variant.storage || "").replace("GB", "").replace("TB", "000"),
        grade: B2C_GRADE[line.grade],
      }, token);
      if (!res.ok) return [{ agent: this.name, kind: "buyback", status: "error", offers: [], message: `HTTP ${res.status}` }];
      const data = await res.json();
      const buy = toOffers(data?.resultats?.offres, "Rachat");
      const sell = toOffers(data?.ventes?.offres, "Revente");
      return [
        { agent: this.name, kind: "buyback", status: buy.length ? "ok" : "empty", offers: buy },
        { agent: this.name, kind: "resale", status: sell.length ? "ok" : "empty", offers: sell },
      ];
    } catch {
      return [unreachable(this.name, "buyback")];
    }
  },
};

/**
 * Laptops: expects a backend endpoint running the laptop scrapers (mySWOOOP, ZOXS, CeX, Back Market…).
 * Contract documented in b2b/README.md. Until it exists the agent reports "unavailable".
 */
const laptopMarket: Agent = {
  name: "Marché PC portables",
  supports: (l) => l.category === "laptop",
  async run(line, token) {
    try {
      const res = await post("/api/market/laptop-prices", {
        brand: line.brand,
        model: line.model,
        cpu: line.variant.cpu,
        ram: line.variant.ram,
        storage: line.variant.storage,
        grade: line.grade,
      }, token);
      if (res.status === 404) {
        return [{ agent: this.name, kind: "resale", status: "unavailable", offers: [], message: "Endpoint /api/market/laptop-prices pas encore disponible côté backend" }];
      }
      if (!res.ok) return [{ agent: this.name, kind: "resale", status: "error", offers: [], message: `HTTP ${res.status}` }];
      const data = await res.json();
      const buy = toOffers(data?.buyback?.offres, "Rachat");
      const sell = toOffers(data?.resale?.offres, "Revente");
      return [
        { agent: this.name, kind: "buyback", status: buy.length ? "ok" : "empty", offers: buy },
        { agent: this.name, kind: "resale", status: sell.length ? "ok" : "empty", offers: sell },
      ];
    } catch {
      return [unreachable(this.name, "resale")];
    }
  },
};

/** Fallback for phones: B2C reference price × grade coefficient (same fallback as the B2C flow). */
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
  return [phoneMarket, laptopMarket, catalogEstimate(gradeCoef)];
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
