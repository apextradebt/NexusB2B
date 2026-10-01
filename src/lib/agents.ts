import type { AgentOffer, AgentResult, Grade, QuoteLine } from "@/types";
import { getRef } from "@/lib/catalog";

const LEGACY_API = import.meta.env.VITE_API_URL || "http://localhost:3001";

type Agent = {
  name: string;
  supports: (line: QuoteLine) => boolean;
  run: (line: QuoteLine) => Promise<AgentResult[]>;
};

const B2C_GRADE: Record<Grade, string> = { A: "parfait_etat", B: "tres_bon_etat", C: "bon_etat", D: "etat_correct", E: "etat_correct" };
type LegacyOffer = { prix?: number; price?: number; revendeur?: string; source?: string; url?: string; lien?: string };
const toOffers = (xs: LegacyOffer[] | undefined, fallback: string): AgentOffer[] =>
  (xs || []).map((o) => ({ source: o.revendeur || o.source || fallback, price: Number(o.prix ?? o.price), url: o.url || o.lien })).filter((o) => o.price > 0);

const nexusMarketAgent: Agent = {
  name: "Marché (Nexus API)",
  supports: (l) => !!LEGACY_API && (l.category === "phone" || l.category === "laptop"),
  async run(line) {
    try {
      // Construction de l'objet Device à envoyer au backend
      // On le prépare de manière lisible pour séparer la logique PC et Téléphone
      let devicePayload: any;

      if (line.category === "laptop") {
        // Pour les PC, on génère un "titre" complet contenant toutes les spécifications
        // Cela permet aux agents (BackMarket, EasyCash) d'extraire la RAM et le CPU eux-mêmes.
        const fullTitle = `${line.brand} ${line.model} ${line.variant.cpu || ""} ${line.variant.ram || ""} ${line.variant.storage || ""}`.trim().replace(/\s+/g, ' ');
        
        // Le modèle "propre" sans le CPU et la RAM (utilisé comme fallback)
        const cleanModel = `${line.brand} ${line.model}`
          .replace(/\b(i[3579]-\w+)\b/gi, '')
          .replace(/\b(ryzen\s+\d+\s+(pro\s+)?\w+)\b/gi, '')
          .replace(/\b\d+\s*GB\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        devicePayload = {
          type: "laptops",
          titre: fullTitle,
          brand: line.brand,
          model: cleanModel,
          storage: (line.variant.storage || "0").replace(/[^0-9]/g, ""),
          color: "",
          grade: B2C_GRADE[line.grade]
        };
      } else {
        // Pour les téléphones, le formatage est plus simple
        devicePayload = {
          type: "phones",
          titre: "",
          brand: line.brand.toLowerCase(),
          model: line.model,
          storage: (line.variant.storage || "").replace("GB", "").replace("TB", "000"),
          color: "",
          grade: B2C_GRADE[line.grade]
        };
      }

      const res = await fetch(`${LEGACY_API}/api/market/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: [devicePayload] }),
      });
      if (!res.ok) return [{ agent: this.name, kind: "buyback", status: "error", offers: [], message: `HTTP ${res.status}` }];
      const responseBody = await res.json();

      const devices = [...(responseBody.knownDevices || []), ...(responseBody.newlyScrapedDevices || [])];
      const data = devices.length > 0 ? devices[0].price : null;

      const buy = toOffers(data?.offres, "Rachat");
      const sell = toOffers(data?.ventes, "Revente");
      return [
        { agent: this.name, kind: "buyback", status: buy.length ? "ok" : "empty", offers: buy },
        { agent: this.name, kind: "resale", status: sell.length ? "ok" : "empty", offers: sell },
      ];
    } catch {
      return [{ agent: this.name, kind: "buyback", status: "error", offers: [], message: "Backend Nexus injoignable" }];
    }
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

export function agentsFor(gradeCoef: Record<Grade, number>): Agent[] {
  return [nexusMarketAgent, catalogEstimate(gradeCoef)];
}

export async function runAgents(line: QuoteLine, agents: Agent[]): Promise<AgentResult[]> {
  const applicable = agents.filter((a) => a.supports(line));
  const results = await Promise.all(applicable.map((a) => a.run(line)));
  return results.flat();
}

export async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>, signal?: AbortSignal) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length && !signal?.aborted) await task(queue.shift()!);
  });
  await Promise.all(workers);
}
