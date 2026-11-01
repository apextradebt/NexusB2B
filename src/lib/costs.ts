// Coûts qui dépendent d'où l'on achète et d'où l'on revend : TVA, copie privée, transport,
// douane et frais de vente. Ce fichier est identique dans nexusb2b et PhoneP2C (src/lib/costs.ts) :
// modifier les deux ensemble.

export type CostCategory = "phone" | "tablet" | "laptop";
export const COST_CATEGORIES: CostCategory[] = ["phone", "tablet", "laptop"];

/** Une tranche de redevance : jusqu'à `upToGb` Go inclus (null : au-delà de la tranche précédente). */
export type LevyBracket = { upToGb: number | null; eur: number };

export type Country = {
  /** Code ISO 3166-1 alpha-2 ("FR", "FI"). */
  code: string;
  name: string;
  eu: boolean;
  /** Taux normal de TVA, en %. */
  vatPct: number;
  /** Redevance copie privée sur un appareil reconditionné revendu dans ce pays, HT par appareil. Vide : aucune. */
  levy: Partial<Record<CostCategory, LevyBracket[]>>;
};

/** Un trajet de transport, d'un pays à un autre (ou dans le même pays). */
export type Lane = {
  from: string;
  to: string;
  /** Envoi ou collecte, par appareil. */
  perUnit: Record<CostCategory, number>;
  /** Forfait par envoi (palette, enlèvement), réparti sur les appareils du lot. */
  perShipment: number;
  /** Droits de douane, en % de la valeur des appareils (0 dans l'UE ; téléphones et PC sont à 0 % hors UE aussi, accord ITA). */
  dutyPct: number;
  /** Dédouanement (déclarant, frais du transporteur), par envoi. */
  clearanceEur: number;
};

/**
 * Comment la TVA pèse sur la revente (les prix de revente relevés sont des prix publics TTC) :
 * - margin : régime de la marge (biens d'occasion achetés sans TVA récupérable : particuliers,
 *   ou vendeur lui-même sous le régime de la marge). TVA du pays d'expédition sur la marge.
 * - normal : achat avec TVA récupérable (lot d'une entreprise). TVA du pays de l'acheteur
 *   (vente à distance via le guichet OSS) sur tout le prix de vente.
 * - none : revente HT (professionnel d'un autre pays de l'UE en autoliquidation) ou prix déjà HT.
 * Hors UE, la revente est une exportation exonérée.
 */
export type VatScheme = "margin" | "normal" | "none";

export type CostSettings = {
  /** Pays du centre de reconditionnement, où passe chaque appareil. */
  home: string;
  countries: Country[];
  lanes: Lane[];
  /** Régime de TVA par défaut d'un nouveau devis. */
  vatScheme: VatScheme;
  /** Pays d'achat et de revente par défaut d'un nouveau devis. */
  buyFrom: string;
  sellTo: string;
  /** Commission de la place de marché, en % du prix de revente. */
  commissionPct: number;
  /** Retours et garantie, en % du prix de revente. */
  returnsPct: number;
  /** Frais de paiement et bancaires, en % du prix d'achat. */
  paymentPct: number;
  /** Assurance transport, en % du prix d'achat. */
  insurancePct: number;
  /** Réception, tri, effacement des données, stockage : par appareil. */
  handlingEur: number;
  /** Éco-participation DEEE, par appareil revendu (selon votre contrat avec l'éco-organisme). */
  ecoFee: Record<CostCategory, number>;
};

/** D'où vient le lot et où il est revendu. */
export type Route = { buyFrom: string; sellTo: string; vatScheme: VatScheme };

const units = (phone: number, tablet: number, laptop: number): Record<CostCategory, number> => ({ phone, tablet, laptop });
const lane = (from: string, to: string, perUnit: Record<CostCategory, number>, perShipment = 0, clearanceEur = 0): Lane =>
  ({ from, to, perUnit, perShipment, dutyPct: 0, clearanceEur });

// Copie France, décision n° 23 du 12 janvier 2023 (en vigueur au 1er février 2023) : barème des
// téléphones et tablettes reconditionnés, HT. Les PC ne sont pas soumis (un barème PC est en
// discussion en 2026). Pas dû sur un appareil exporté ou livré dans un autre pays de l'UE (CPI
// L. 311-8), d'où un barème rattaché au pays de revente.
const COPIE_FRANCE: Country["levy"] = {
  phone: [
    { upToGb: 0.135, eur: 0.3 }, { upToGb: 0.537, eur: 0.9 }, { upToGb: 2, eur: 1.5 }, { upToGb: 8, eur: 2.4 },
    { upToGb: 16, eur: 4.8 }, { upToGb: 32, eur: 6 }, { upToGb: 64, eur: 7.2 }, { upToGb: null, eur: 8.4 },
  ],
  tablet: [{ upToGb: 16, eur: 5.2 }, { upToGb: 32, eur: 6.5 }, { upToGb: 64, eur: 7.8 }, { upToGb: null, eur: 9.1 }],
};

const country = (code: string, name: string, vatPct: number, eu = true, levy: Country["levy"] = {}): Country => ({ code, name, eu, vatPct, levy });

export const DEFAULT_COSTS: CostSettings = {
  home: "FR",
  // Taux normaux de TVA au 1er novembre 2026. La redevance des autres pays reste à saisir.
  countries: [
    country("FR", "France", 20, true, COPIE_FRANCE),
    country("FI", "Finlande", 25.5),
    country("BE", "Belgique", 21),
    country("NL", "Pays-Bas", 21),
    country("LU", "Luxembourg", 17),
    country("DE", "Allemagne", 19),
    country("AT", "Autriche", 20),
    country("ES", "Espagne", 21),
    country("PT", "Portugal", 23),
    country("IT", "Italie", 22),
    country("IE", "Irlande", 23),
    country("SE", "Suède", 25),
    country("DK", "Danemark", 25),
    country("EE", "Estonie", 24),
    country("PL", "Pologne", 23),
    country("GB", "Royaume-Uni", 20, false),
    country("CH", "Suisse", 8.1, false),
  ],
  // Estimations de départ : remplacez-les par vos tarifs transporteur.
  lanes: [
    lane("FR", "FR", units(7.5, 9, 12)),
    lane("FR", "FI", units(14, 16, 25)),
    lane("FI", "FR", units(1, 1.5, 3), 350),
    lane("FR", "BE", units(9, 10, 16)),
    lane("BE", "FR", units(0.5, 1, 2), 150),
    lane("FR", "DE", units(9, 10, 16)),
    lane("DE", "FR", units(0.5, 1, 2), 220),
    lane("FR", "ES", units(10, 11, 18)),
    lane("ES", "FR", units(0.5, 1, 2), 250),
    lane("GB", "FR", units(1, 1.5, 3), 400, 60),
    lane("CH", "FR", units(1, 1.5, 3), 300, 60),
  ],
  vatScheme: "margin",
  buyFrom: "FR",
  sellTo: "FR",
  commissionPct: 12,
  returnsPct: 3,
  paymentPct: 0,
  insurancePct: 0,
  handlingEur: 0,
  ecoFee: units(0, 0, 0),
};

/** Réglages enregistrés avant l'ajout d'un champ : complétés avec les valeurs par défaut. */
export function normalizeCosts(c?: Partial<CostSettings> | null, defaults: CostSettings = DEFAULT_COSTS): CostSettings {
  if (!c) return defaults;
  return { ...defaults, ...c, ecoFee: { ...defaults.ecoFee, ...c.ecoFee } };
}

export const findCountry = (c: CostSettings, code: string) => c.countries.find((x) => x.code === code);
export const findLane = (c: CostSettings, from: string, to: string) => c.lanes.find((l) => l.from === from && l.to === to);

/** "128GB", "1 To", "256GB SSD", "512" → Go. undefined si illisible. */
export function storageGb(storage?: string): number | undefined {
  if (!storage) return undefined;
  const m = storage.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(t|g|m)?/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] ?? "g").toLowerCase();
  return unit === "t" ? n * 1000 : unit === "m" ? n / 1000 : n;
}

/** Redevance d'un appareil d'après la capacité. Capacité inconnue : la tranche la plus haute (prudent). */
export function levyFor(brackets: LevyBracket[] | undefined, gb: number | undefined): number {
  if (!brackets?.length) return 0;
  if (gb !== undefined) {
    for (const b of brackets) if (b.upToGb === null || gb <= b.upToGb) return b.eur;
  }
  return brackets[brackets.length - 1].eur;
}

/** Taux de TVA appliqué à la revente, en %, et le pays qui le fixe. */
export function vatFor(c: CostSettings, route: Route): { pct: number; country?: string } {
  const dest = findCountry(c, route.sellTo);
  if (route.vatScheme === "none" || (dest && !dest.eu)) return { pct: 0 };
  // Régime de la marge : la TVA du pays d'expédition, même pour une vente à un particulier d'un autre pays.
  const taxing = route.vatScheme === "margin" ? findCountry(c, c.home) : dest;
  return taxing ? { pct: taxing.vatPct, country: taxing.code } : { pct: 0 };
}

export type CostItem = "refurb" | "inbound" | "outbound" | "duty" | "levy" | "eco" | "handling" | "fees" | "vat";

/** Ce que coûte un appareil entre l'achat et la revente, en € par appareil. */
export type CostBreakdown = {
  items: Partial<Record<CostItem, number>>;
  /** Somme des postes, TVA comprise. */
  total: number;
  /** Trajets sans tarif dans les réglages ("FI→FR"). */
  missingLanes: string[];
};

export type CostInput = {
  category: CostCategory;
  storage?: string;
  /** Prix de revente public (TTC), par appareil. */
  sell: number;
  /** Remise en état, par appareil (réglée ailleurs, par grade). */
  refurb: number;
  /** Appareils du lot, pour répartir les forfaits par envoi. 0 : ne pas compter les forfaits (rachat à l'unité). */
  lotUnits: number;
};

/** Les coûts fixes et proportionnels, sans la TVA, qui dépend du prix d'achat. */
function parts(c: CostSettings, route: Route, x: CostInput) {
  const inbound = findLane(c, route.buyFrom, c.home);
  const outbound = findLane(c, c.home, route.sellTo);
  const missingLanes = [
    !inbound && `${route.buyFrom}→${c.home}`,
    !outbound && `${c.home}→${route.sellTo}`,
  ].filter((s): s is string => !!s);
  const share = (eur: number) => (x.lotUnits > 0 ? eur / x.lotUnits : 0);
  const leg = (l?: Lane) => (l ? l.perUnit[x.category] + share(l.perShipment) : 0);
  const dest = findCountry(c, route.sellTo);
  const fixed: Partial<Record<CostItem, number>> = {
    refurb: x.refurb,
    inbound: leg(inbound),
    outbound: leg(outbound),
    duty: share((inbound?.clearanceEur ?? 0) + (outbound?.clearanceEur ?? 0)),
    levy: levyFor(dest?.levy[x.category], storageGb(x.storage)),
    eco: c.ecoFee[x.category],
    handling: c.handlingEur,
  };
  return {
    fixed,
    fixedTotal: Object.values(fixed).reduce((a: number, b) => a + (b ?? 0), 0),
    /** Part du prix de revente : commission, retours, droits à l'arrivée. */
    onSell: (c.commissionPct + c.returnsPct + (outbound?.dutyPct ?? 0)) / 100,
    /** Part du prix d'achat : paiement, assurance, droits à l'import. */
    onBuy: (c.paymentPct + c.insurancePct + (inbound?.dutyPct ?? 0)) / 100,
    vatShare: (() => { const v = vatFor(c, route).pct / 100; return v / (1 + v); })(),
    missingLanes,
  };
}

/** Détail des coûts d'un appareil acheté `buy` et revendu `x.sell`. */
export function costBreakdown(c: CostSettings, route: Route, x: CostInput, buy: number): CostBreakdown {
  const p = parts(c, route, x);
  // Droits proportionnels rangés avec la douane, le reste des pourcentages dans les frais.
  const inbound = findLane(c, route.buyFrom, c.home);
  const outbound = findLane(c, c.home, route.sellTo);
  const dutyPart = ((inbound?.dutyPct ?? 0) * buy + (outbound?.dutyPct ?? 0) * x.sell) / 100;
  const fees = p.onSell * x.sell + p.onBuy * buy - dutyPart;
  const vat = route.vatScheme === "margin" ? p.vatShare * Math.max(0, x.sell - buy) : p.vatShare * x.sell;
  const items = { ...p.fixed, duty: (p.fixed.duty ?? 0) + dutyPart, fees, vat };
  const rounded = Object.fromEntries(
    Object.entries(items).filter(([, v]) => v !== undefined && Math.abs(v) >= 0.005).map(([k, v]) => [k, Math.round(v! * 100) / 100]),
  ) as CostBreakdown["items"];
  return { items: rounded, total: Object.values(items).reduce((a: number, b) => a + (b ?? 0), 0), missingLanes: p.missingLanes };
}

/** Marge nette d'un appareil acheté `buy` : revente moins achat, moins tous les coûts et la TVA. */
export const netMargin = (c: CostSettings, route: Route, x: CostInput, buy: number) =>
  x.sell - buy - costBreakdown(c, route, x, buy).total;

/**
 * Prix d'achat qui laisse exactement `targetNet` € de marge nette (arrondi à l'euro inférieur, jamais négatif).
 * marge : vente − achat − fixes − onSell·vente − onBuy·achat − TVA, la TVA valant
 *   vatShare·(vente − achat) au régime de la marge, vatShare·vente sinon.
 */
export function buyForNet(c: CostSettings, route: Route, x: CostInput, targetNet: number): number {
  const p = parts(c, route, x);
  const s = p.vatShare;
  const base = x.sell * (1 - p.onSell) - p.fixedTotal - targetNet;
  const buy = route.vatScheme === "margin" ? (base - s * x.sell) / (1 + p.onBuy - s) : (base - s * x.sell) / (1 + p.onBuy);
  return Math.max(0, Math.floor(buy + 1e-9)); // 279.9999… reste 280
}
