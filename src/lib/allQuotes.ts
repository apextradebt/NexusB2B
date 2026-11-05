import type { QuoteStatus, SavedQuote } from "@/types";

// One list for two kinds of quote: B2B lots quoted here, and B2C buybacks quoted in the shops
// (Nexus Back). Their statuses differ, so both map onto shared stages to filter them together.

export type RetailStatus = "Devis Envoyé" | "Refusé" | "En boutique" | "Expédié" | "Réceptionné" | "En traitement" | "Clôturé";

export type RetailMessage = { text: string; at: string; by: string };

/** A quote as GET /api/backoffice/devis returns it. */
export type RetailQuote = {
  id: string;
  date: string;
  status: RetailStatus;
  shipmentId?: string;
  type: "unitaire" | "flotte";
  totalProposedPrice: number;
  items: { quantity: number; grade: string; unitPrice: number; device: { brand: string; model: string; storage?: string } }[];
  client: { firstName: string; lastName: string; company?: string; email?: string; phone?: string };
  company?: string;
  magasin?: string;
  createdBy?: { prenom: string; nom: string };
  messages?: RetailMessage[];
  sellTotal: number;
  margin: number;
};

export const STAGES = ["open", "accepted", "transit", "processing", "done", "refused"] as const;
export type Stage = typeof STAGES[number];

const B2B_STAGE: Record<QuoteStatus, Stage> = {
  created: "open", approved: "accepted", shipped: "transit", arrived: "processing", in_progress: "processing", completed: "done", paid: "done",
};

const B2C_STAGE: Record<RetailStatus, Stage> = {
  "Devis Envoyé": "open", "En boutique": "accepted", "Expédié": "transit", "Réceptionné": "processing", "En traitement": "processing", "Clôturé": "done", "Refusé": "refused",
};

/** Steps declared from the processing centre. A shop moves an order to "Expédié" by shipping it. */
const B2C_STEPS: RetailStatus[] = ["Expédié", "Réceptionné", "En traitement", "Clôturé"];

export function nextRetailStep(status: RetailStatus): RetailStatus | null {
  const i = B2C_STEPS.indexOf(status);
  return i >= 0 && i < B2C_STEPS.length - 1 ? B2C_STEPS[i + 1] : null;
}

type Common = {
  /** Unique across both sources. */
  key: string;
  id: string;
  date: string;
  stage: Stage;
  client: string;
  /** Who quoted it: "Paris · Lea Martin" for a shop, empty for a quote made here. */
  owner: string;
  summary: string;
  units: number;
  buy: number;
  sell: number | null;
  margin: number | null;
};

export type UnifiedQuote =
  | (Common & { source: "b2b"; status: QuoteStatus; quote: SavedQuote })
  | (Common & { source: "b2c"; status: RetailStatus; quote: RetailQuote });

export function fromB2B(q: SavedQuote): UnifiedQuote {
  const status = q.status ?? "created";
  return {
    source: "b2b", status, quote: q,
    key: `b2b:${q.id}`, id: q.id, date: q.createdAt, stage: B2B_STAGE[status],
    client: q.client, owner: "", summary: q.reference || q.fileName,
    units: q.totals.units, buy: q.totals.buy, sell: q.totals.sell, margin: q.totals.margin,
  };
}

export function fromB2C(q: RetailQuote): UnifiedQuote {
  const author = [q.createdBy?.prenom, q.createdBy?.nom].filter(Boolean).join(" ");
  return {
    source: "b2c", status: q.status, quote: q,
    key: `b2c:${q.id}`, id: q.id, date: q.date, stage: B2C_STAGE[q.status] ?? "accepted",
    client: q.client.company || `${q.client.firstName} ${q.client.lastName}`,
    owner: [q.magasin, author].filter(Boolean).join(" · "),
    summary: q.items.map((i) => [i.quantity > 1 ? `${i.quantity}x` : "", i.device.model, i.device.storage, i.grade].filter(Boolean).join(" ")).join(", "),
    units: q.items.reduce((n, i) => n + i.quantity, 0),
    buy: q.totalProposedPrice,
    // No sell price on the grid: the margin is unknown, not zero.
    sell: q.sellTotal > 0 ? q.sellTotal : null,
    margin: q.sellTotal > 0 ? q.margin : null,
  };
}

/** Both lists, newest first. */
export function mergeQuotes(b2b: SavedQuote[], b2c: RetailQuote[]): UnifiedQuote[] {
  return [...b2b.map(fromB2B), ...b2c.map(fromB2C)].sort((a, b) => b.date.localeCompare(a.date));
}

export function matchesQuery(q: UnifiedQuote, query: string) {
  const s = query.trim().toLowerCase();
  return !s || [q.id, q.client, q.owner, q.summary].join(" ").toLowerCase().includes(s);
}
