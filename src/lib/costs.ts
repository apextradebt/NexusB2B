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
  /** Écocontribution DEEE / piles par appareil revendu dans ce pays, à la place de celle des réglages. */
  epr?: Partial<Record<CostCategory, number>>;
  /** Source et fiabilité des montants (organisme, date, ce qui reste à vérifier). */
  note?: string;
};

/**
 * Un trajet de transport, d'un pays à un autre (ou dans le même pays). Deux façons d'expédier :
 * - en colis, à l'unité, vers un acheteur particulier : `perUnit` ;
 * - en lot (palette, carton de boutique) : `lotPerUnit` par appareil + `perShipment` par envoi,
 *   réparti sur les appareils du lot. C'est ainsi qu'arrivent les achats et que partent les ventes B2B.
 */
export type Lane = {
  from: string;
  to: string;
  /** Colis vers un acheteur, par appareil. */
  perUnit: Record<CostCategory, number>;
  /** Envoi en lot : emballage et manutention par appareil. Absent (réglages anciens) : `perUnit`. */
  lotPerUnit?: number;
  /** Forfait par envoi en lot (palette, enlèvement), réparti sur les appareils du lot. */
  perShipment: number;
  /** Droits de douane, en % de la valeur des appareils (0 dans l'UE ; téléphones et PC sont à 0 % hors UE aussi, accord ITA). */
  dutyPct: number;
  /** Dédouanement (déclarant, frais du transporteur), par envoi en lot. */
  clearanceEur: number;
  /** Tarif par défaut, estimé : remplacé par les estimations à jour tant que personne ne l'a modifié. */
  estimate?: boolean;
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

/**
 * De qui vient le lot : décide du régime de TVA possible à la revente.
 * - consumer : particuliers (rachat en boutique), pas de TVA à récupérer.
 * - business : entreprise qui facture la TVA (ou, depuis un autre pays de l'UE, facture HT en
 *   autoliquidation) : TVA récupérable, revente au régime normal.
 * - business_margin : entreprise qui vend elle-même sous le régime de la marge (facture sans TVA).
 */
export type Supplier = "consumer" | "business" | "business_margin";

/** À qui l'appareil est revendu : particuliers (prix TTC) ou professionnels (prix HT). */
export type Channel = "b2c" | "b2b";

/**
 * Pays de revente « marketplace UE » (Back Market…) : l'acheteur peut être dans n'importe quel pays
 * où l'annonce est publiée ; les coûts sont la moyenne des pays de `marketMix`.
 */
export const EU_MIX = "EU";

/** Le régime de la marge n'est possible que sans TVA récupérée à l'achat. */
export const schemeForSupplier = (s: Supplier): VatScheme => (s === "business" ? "normal" : "margin");

export type CostSettings = {
  /** Pays du centre de reconditionnement, où passe chaque appareil. */
  home: string;
  countries: Country[];
  lanes: Lane[];
  /** Version des trajets par défaut déjà intégrés à ces réglages (voir normalizeCosts). */
  lanesVersion?: number;
  /** Appareils par palette, pour compter les palettes d'un gros lot. */
  devicesPerPallet: Record<CostCategory, number>;
  /** Régime de TVA par défaut d'un nouveau devis. */
  vatScheme: VatScheme;
  /** Pays d'achat et de revente par défaut d'un nouveau devis (sellTo peut valoir EU_MIX). */
  buyFrom: string;
  sellTo: string;
  /** Fournisseur et clientèle par défaut d'un nouveau devis. */
  supplier: Supplier;
  channel: Channel;
  /** Ventes « marketplace UE » par pays d'acheteur, en % (Back Market : pays où vos annonces sont publiées). */
  marketMix: Record<string, number>;
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

/** D'où vient le lot, à qui et où il est revendu. Sans supplier / channel (devis plus anciens) : vente aux particuliers. */
export type Route = { buyFrom: string; sellTo: string; vatScheme: VatScheme; supplier?: Supplier; channel?: Channel };

const units = (phone: number, tablet: number, laptop: number): Record<CostCategory, number> => ({ phone, tablet, laptop });

/**
 * Tarifs estimés (novembre 2026), HT, pour un expéditeur professionnel passant par une plateforme
 * (Boxtal, Sendcloud, Packlink) ou un contrat transporteur ; à remplacer par vos tarifs.
 * Colis : téléphone ≈ 0,5 kg, tablette ≈ 1 kg, PC ≈ 3 kg emballé. Repères : Mondial Relay point relais
 * France 5,99 € TTC (1 kg), Belgique / Pays-Bas 6,60 €, Espagne / Italie / Portugal 9,50 €, Pologne 10,40 € ;
 * Packlink dès 11,09 € vers l'Allemagne ; Colissimo public UE 19,39 € (1 kg), Royaume-Uni 23,39 €.
 * Lot : une palette en groupage, 150-300 € entre pays voisins, 300-600 € sur les longues distances
 * (jusqu'à 680 € annoncés Finlande → France) ; dédouanement ≈ 60 € par envoi hors UE.
 * Pays : [colis téléphone, tablette, PC], palette, dédouanement.
 */
const RATES: Record<string, [[number, number, number], number, number?]> = {
  FR: [[6.5, 7.5, 11], 120],
  BE: [[7, 8, 12], 200],
  LU: [[7, 8, 12], 200],
  NL: [[7, 8, 12], 230],
  DE: [[10, 11, 15], 250],
  ES: [[10, 11, 16], 280],
  IT: [[10, 11, 16], 300],
  AT: [[12, 13, 18], 330],
  PT: [[10, 11, 16], 350],
  PL: [[11, 12, 17], 350],
  DK: [[13, 15, 21], 400],
  IE: [[14, 16, 22], 450],
  SE: [[14, 16, 22], 450],
  FI: [[14, 16, 22], 480],
  EE: [[14, 16, 22], 500],
  GB: [[18, 20, 28], 400, 60],
  CH: [[20, 22, 30], 320, 60],
};
/** Emballage et manutention d'un appareil envoyé en lot (carton de boutique, palette). */
const LOT_PER_UNIT = 1;
export const LANES_VERSION = 2;

/** Trajets par défaut : de France vers chaque pays et retour, mêmes tarifs dans les deux sens. */
function defaultLanes(home = "FR"): Lane[] {
  return Object.entries(RATES).flatMap(([code, [[phone, tablet, laptop], pallet, clearance = 0]]) => {
    const make = (from: string, to: string): Lane =>
      ({ from, to, perUnit: units(phone, tablet, laptop), lotPerUnit: LOT_PER_UNIT, perShipment: pallet, dutyPct: 0, clearanceEur: clearance, estimate: true });
    return code === home ? [make(home, home)] : [make(home, code), make(code, home)];
  });
}

/** Trajets livrés par défaut avant LANES_VERSION 2 : reconnus pour être remplacés s'ils n'ont pas été modifiés. */
const legacy = (from: string, to: string, [p, t, l]: number[], perShipment: number, clearanceEur = 0): Lane =>
  ({ from, to, perUnit: units(p, t, l), perShipment, dutyPct: 0, clearanceEur });
const LEGACY_LANES: Lane[] = [
  legacy("FR", "FR", [7.5, 9, 12], 0), legacy("FR", "FI", [14, 16, 25], 0), legacy("FI", "FR", [1, 1.5, 3], 350),
  legacy("FR", "BE", [9, 10, 16], 0), legacy("BE", "FR", [0.5, 1, 2], 150), legacy("FR", "DE", [9, 10, 16], 0), legacy("DE", "FR", [0.5, 1, 2], 220),
  legacy("FR", "ES", [10, 11, 18], 0), legacy("FR", "IT", [10, 11, 18], 0), legacy("FR", "NL", [9, 10, 16], 0), legacy("FR", "AT", [11, 12, 19], 0),
  legacy("FR", "PT", [11, 12, 19], 0), legacy("ES", "FR", [0.5, 1, 2], 250), legacy("GB", "FR", [1, 1.5, 3], 400, 60), legacy("CH", "FR", [1, 1.5, 3], 300, 60),
];

const sameLane = (a: Lane, b: Lane) =>
  a.from === b.from && a.to === b.to && a.perShipment === b.perShipment && a.dutyPct === b.dutyPct && a.clearanceEur === b.clearanceEur
  && COST_CATEGORIES.every((k) => a.perUnit[k] === b.perUnit[k]) && (a.lotPerUnit ?? null) === (b.lotPerUnit ?? null);

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

const country = (code: string, name: string, vatPct: number, eu = true, levy: Country["levy"] = {}, note?: string): Country =>
  ({ code, name, eu, vatPct, levy, ...(note ? { note } : {}) });
/** Redevance forfaitaire, quelle que soit la capacité. */
const flat = (eur: number): LevyBracket[] => [{ upToGb: null, eur }];

export const DEFAULT_COSTS: CostSettings = {
  home: "FR",
  // Taux normaux de TVA au 1er novembre 2026. Redevances relevées en novembre 2026 : seules celles
  // dont la source est citée sont remplies, les autres pays sont à vérifier (note).
  countries: [
    country("FR", "France", 20, true, COPIE_FRANCE,
      "Copie France, décision n° 23 (reconditionnés), HT. Déclaration mensuelle des sorties de stock avant le 20 du mois suivant. PC non soumis."),
    country("FI", "Finlande", 25.5, true, {}, "Pas de redevance sur les appareils : compensation payée par l'État depuis 2015."),
    country("BE", "Belgique", 21, true, { phone: flat(4), tablet: flat(4), laptop: flat(4) },
      "Auvibel, tarif depuis le 1er mars 2026, HT. Taux réduit des reconditionnés (58-60 % ?) non confirmé : tarif plein par prudence."),
    country("NL", "Pays-Bas", 21, true, { phone: flat(3.42), tablet: flat(1.68), laptop: flat(1.68) },
      "Stichting de Thuiskopie, tarif reconditionné 2025 (60 % du neuf), HT. 2026 indexé, montant exact à vérifier."),
    country("LU", "Luxembourg", 17, true, {}, "Redevance : à vérifier."),
    country("DE", "Allemagne", 19, true, { phone: flat(6.25), tablet: flat(8.75) },
      "ZPÜ, montants réclamés (contestés) pour les appareils grand public, aussi sur l'occasion importée. PC : tarif à vérifier."),
    country("AT", "Autriche", 20, true, { phone: flat(5.5), tablet: flat(5.5), laptop: flat(7.5) },
      "austro mechana, Gesamtvertrag 2025 (tarif contractuel ; 1,5 × sans contrat). Dû sur un reconditionné mis en circulation pour la 1re fois en Autriche. Déclaration trimestrielle."),
    country("ES", "Espagne", 21, true, {}, "Redevance sur les appareils : montants à vérifier."),
    country("PT", "Portugal", 23, true, {}, "Redevance AGECOP par capacité : montants à vérifier."),
    country("IT", "Italie", 22, true, {},
      "SIAE : smartphone 128 Go ≈ 6,90 €, PC ≈ 5,20 € avant le décret de 2025 (+16,8 %, reconditionnés inclus) : à vérifier avant de remplir."),
    country("IE", "Irlande", 23, true, {}, "Pas de redevance pour copie privée."),
    country("SE", "Suède", 25, true, {}, "Copyswede, redevance par Go sur les téléphones : montant à vérifier."),
    country("DK", "Danemark", 25, true, {}, "Copy-Dan : à vérifier."),
    country("EE", "Estonie", 24, true, {}, "Redevance en % du prix : à vérifier."),
    country("PL", "Pologne", 23, true, {}, "ZAiKS : à vérifier."),
    country("GB", "Royaume-Uni", 20, false, {}, "Pas de redevance pour copie privée. Hors UE : TVA à l'import, dédouanement."),
    country("CH", "Suisse", 8.1, false, {}, "Redevance SUISA sur les mémoires : à vérifier. Hors UE : TVA à l'import 8,1 %, dédouanement."),
  ],
  // Estimations : remplacez-les par vos tarifs transporteur (voir RATES).
  lanes: defaultLanes(),
  lanesVersion: LANES_VERSION,
  // Palette européenne 120 × 80 chargée à ~1,5 m : appareils emballés en vrac, ordre de grandeur.
  devicesPerPallet: units(500, 200, 100),
  vatScheme: "margin",
  buyFrom: "FR",
  sellTo: "FR",
  supplier: "consumer",
  channel: "b2c",
  // Estimation de départ : remplacez-la par la répartition réelle de vos ventes (rapport par pays de la marketplace).
  marketMix: { FR: 60, DE: 10, ES: 8, IT: 8, BE: 6, NL: 4, AT: 2, PT: 2 },
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
  return {
    ...defaults, ...c, ecoFee: { ...defaults.ecoFee, ...c.ecoFee }, marketMix: c.marketMix ?? defaults.marketMix,
    devicesPerPallet: { ...defaults.devicesPerPallet, ...c.devicesPerPallet },
    countries: c.countries ? c.countries.map((x) => upgradeCountry(x, defaults)) : defaults.countries,
    lanes: c.lanes ? upgradeLanes(c.lanes, c.lanesVersion ?? 1, defaults) : defaults.lanes,
    lanesVersion: Math.max(c.lanesVersion ?? 1, defaults.lanesVersion ?? 1),
  };
}

/**
 * Trajets enregistrés : un tarif estimé (jamais modifié) reprend l'estimation à jour ; ceux d'une version
 * précédente identiques à son défaut aussi, et les trajets par défaut absents sont ajoutés. Un trajet
 * modifié à la main n'est jamais touché.
 */
function upgradeLanes(lanes: Lane[], version: number, defaults: CostSettings): Lane[] {
  const fresh = (l: Lane) => defaults.lanes.find((d) => d.from === l.from && d.to === l.to);
  const out = lanes.map((l) => {
    const d = fresh(l);
    if (!d) return l;
    if (l.estimate || (version < LANES_VERSION && LEGACY_LANES.some((old) => sameLane(old, l)))) return d;
    return l;
  });
  if (version < (defaults.lanesVersion ?? 1)) {
    for (const d of defaults.lanes) if (!out.some((l) => l.from === d.from && l.to === d.to)) out.push(d);
  }
  return out;
}

/**
 * Un pays enregistré avant l'ajout des notes (champ `note` absent) reprend la note, les
 * redevances et l'écocontribution par défaut des catégories qu'il n'avait pas remplies. Dès que
 * le pays est enregistré avec une note, même vide, il est laissé tel quel.
 */
function upgradeCountry(x: Country, defaults: CostSettings): Country {
  const d = findCountry(defaults, x.code);
  if (x.note !== undefined || !d) return x;
  const levy = { ...x.levy };
  for (const k of COST_CATEGORIES) if (!levy[k]?.length && d.levy[k]?.length) levy[k] = d.levy[k];
  return { ...x, levy, note: d.note ?? "", ...(d.epr || x.epr ? { epr: { ...d.epr, ...x.epr } } : {}) };
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

/** Pays de revente et leur poids : un seul pays, ou la répartition marketplace. */
export function destinations(c: CostSettings, route: Route): { code: string; w: number }[] {
  if (route.sellTo !== EU_MIX) return [{ code: route.sellTo, w: 1 }];
  const entries = Object.entries(c.marketMix).filter(([, pct]) => pct > 0);
  const sum = entries.reduce((a, [, pct]) => a + pct, 0);
  return sum > 0 ? entries.map(([code, pct]) => ({ code, w: pct / sum })) : [{ code: c.home, w: 1 }];
}

/**
 * TVA restant à notre charge sur une revente vers `code`, en % et le pays qui la fixe :
 * - hors UE : exportation exonérée ;
 * - régime de la marge : TVA du pays d'expédition sur la marge, pour un particulier comme pour un
 *   professionnel, quel que soit son pays dans l'UE ;
 * - régime normal, vente aux particuliers : TVA du pays de l'acheteur (vente à distance, guichet OSS) ;
 * - régime normal, vente aux professionnels : prix HT, TVA facturée en plus (France) ou livraison
 *   intracommunautaire exonérée : neutre.
 */
function vatTo(c: CostSettings, route: Route, code: string): { pct: number; country?: string } {
  const dest = findCountry(c, code);
  if (route.vatScheme === "none" || (dest && !dest.eu)) return { pct: 0 };
  if (route.vatScheme === "margin") {
    const home = findCountry(c, c.home);
    return home ? { pct: home.vatPct, country: home.code } : { pct: 0 };
  }
  if ((route.channel ?? "b2c") === "b2b") return { pct: 0 };
  return dest ? { pct: dest.vatPct, country: dest.code } : { pct: 0 };
}

/** Taux de TVA à notre charge sur la revente, en % (moyenne pondérée pour la marketplace) ; `country` s'il est unique. */
export function vatFor(c: CostSettings, route: Route): { pct: number; country?: string } {
  const rates = destinations(c, route).map((d) => ({ ...vatTo(c, route, d.code), w: d.w }));
  const pct = Math.round(rates.reduce((a, r) => a + r.pct * r.w, 0) * 100) / 100;
  const countries = new Set(rates.filter((r) => r.pct > 0).map((r) => r.country));
  return countries.size === 1 ? { pct, country: [...countries][0] } : { pct };
}

export type CostItem = "refurb" | "inbound" | "outbound" | "duty" | "levy" | "eco" | "handling" | "fees" | "vat";

/** Comment voyage l'appareil : palette (lot), colis (à l'unité) ou carton de boutique (rachat à l'unité). */
export type ShipMode = "pallet" | "parcel" | "box";

/** Ce que coûte un appareil entre l'achat et la revente, en € par appareil. */
export type CostBreakdown = {
  items: Partial<Record<CostItem, number>>;
  /** Mode retenu pour chaque trajet (le moins cher pour un lot). Absent vers la marketplace (moyenne de pays). */
  modes: { inbound?: ShipMode; outbound?: ShipMode };
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
  /** Palettes du lot (voir palletsFor). Absent : une palette. */
  lotPallets?: number;
};

/** Palettes nécessaires pour un lot, d'après la place qu'occupe chaque catégorie. */
export function palletsFor(c: CostSettings, items: { category: CostCategory; quantity: number }[]): number {
  const fill = items.reduce((a, i) => a + i.quantity / Math.max(1, c.devicesPerPallet[i.category]), 0);
  return Math.max(1, Math.ceil(fill - 1e-9));
}

/**
 * Les coûts fixes et proportionnels, sans la TVA (qui dépend du prix d'achat). Vers la marketplace UE,
 * chaque poste est la moyenne des pays de la répartition.
 * Revente à un professionnel d'un autre pays : ni copie privée ni écocontribution de notre côté,
 * l'acheteur les doit en important ; commission de marketplace seulement pour les particuliers.
 */
function parts(c: CostSettings, route: Route, x: CostInput) {
  const inbound = findLane(c, route.buyFrom, c.home);
  const share = (eur: number) => (x.lotUnits > 0 ? eur / x.lotUnits : 0);
  const pallets = x.lotPallets ?? 1;
  /**
   * Un lot (achat, vente B2B) part en palettes : manutention par appareil + palettes et dédouanement
   * répartis sur le lot ; si c'est moins cher, en colis à l'unité (petit lot qui vient de loin).
   * Sans taille de lot (rachat en boutique) : le carton de la boutique, manutention seule.
   */
  const lot = (l?: Lane): { transport: number; clearance: number; mode?: ShipMode } => {
    if (!l) return { transport: 0, clearance: 0 };
    const perDevice = l.lotPerUnit ?? l.perUnit[x.category];
    if (x.lotUnits <= 0) return { transport: perDevice, clearance: 0, mode: "box" };
    const pallet = { transport: perDevice + share(l.perShipment * pallets), clearance: share(l.clearanceEur), mode: "pallet" as const };
    const parcel = { transport: l.perUnit[x.category], clearance: 0, mode: "parcel" as const };
    return parcel.transport < pallet.transport + pallet.clearance ? parcel : pallet;
  };
  const channel = route.channel ?? "b2c";
  const gb = storageGb(x.storage);
  const missingLanes = inbound ? [] : [`${route.buyFrom}→${c.home}`];
  let outbound = 0, outClearance = 0, levy = 0, eco = 0, dutyOnSell = 0, vatShare = 0;
  const outModes = new Set<ShipMode | undefined>();
  for (const { code, w } of destinations(c, route)) {
    const dest = findCountry(c, code);
    const lane = findLane(c, c.home, code);
    if (!lane) missingLanes.push(`${c.home}→${code}`);
    const ownImport = channel === "b2b" && code !== c.home;
    // Vente B2B : en lot comme à l'achat ; à un particulier : un colis par appareil.
    const leg = channel === "b2b" ? lot(lane) : { transport: lane?.perUnit[x.category] ?? 0, clearance: 0, mode: "parcel" as const };
    outbound += w * leg.transport;
    outClearance += w * leg.clearance;
    outModes.add(leg.mode);
    levy += w * (ownImport ? 0 : levyFor(dest?.levy[x.category], gb));
    eco += w * (ownImport ? 0 : dest?.epr?.[x.category] ?? c.ecoFee[x.category]);
    dutyOnSell += w * (lane?.dutyPct ?? 0) / 100;
    const v = vatTo(c, route, code).pct / 100;
    vatShare += w * v / (1 + v);
  }
  const inLeg = lot(inbound);
  const fixed: Partial<Record<CostItem, number>> = {
    refurb: x.refurb,
    inbound: inLeg.transport,
    outbound,
    duty: inLeg.clearance + outClearance,
    levy,
    eco,
    handling: c.handlingEur,
  };
  const dutyOnBuy = (inbound?.dutyPct ?? 0) / 100;
  return {
    fixed,
    fixedTotal: Object.values(fixed).reduce((a: number, b) => a + (b ?? 0), 0),
    dutyOnSell,
    dutyOnBuy,
    /** Part du prix de revente : commission (particuliers), retours, droits à l'arrivée. */
    onSell: ((channel === "b2c" ? c.commissionPct : 0) + c.returnsPct) / 100 + dutyOnSell,
    /** Part du prix d'achat : paiement, assurance, droits à l'import. */
    onBuy: (c.paymentPct + c.insurancePct) / 100 + dutyOnBuy,
    vatShare,
    missingLanes,
    modes: { inbound: inLeg.mode, outbound: outModes.size === 1 ? [...outModes][0] : undefined },
  };
}

/** Détail des coûts d'un appareil acheté `buy` et revendu `x.sell`. */
export function costBreakdown(c: CostSettings, route: Route, x: CostInput, buy: number): CostBreakdown {
  const p = parts(c, route, x);
  // Droits proportionnels rangés avec la douane, le reste des pourcentages dans les frais.
  const dutyPart = p.dutyOnBuy * buy + p.dutyOnSell * x.sell;
  const fees = p.onSell * x.sell + p.onBuy * buy - dutyPart;
  const vat = route.vatScheme === "margin" ? p.vatShare * Math.max(0, x.sell - buy) : p.vatShare * x.sell;
  const items = { ...p.fixed, duty: (p.fixed.duty ?? 0) + dutyPart, fees, vat };
  const rounded = Object.fromEntries(
    Object.entries(items).filter(([, v]) => v !== undefined && Math.abs(v) >= 0.005).map(([k, v]) => [k, Math.round(v! * 100) / 100]),
  ) as CostBreakdown["items"];
  return { items: rounded, total: Object.values(items).reduce((a: number, b) => a + (b ?? 0), 0), missingLanes: p.missingLanes, modes: p.modes };
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

/** Trajets du devis sans tarif de transport dans les réglages ("FI→FR"). */
export function missingLanes(c: CostSettings, route: Route): string[] {
  return [
    ...(findLane(c, route.buyFrom, c.home) ? [] : [`${route.buyFrom}→${c.home}`]),
    ...destinations(c, route).filter((d) => !findLane(c, c.home, d.code)).map((d) => `${c.home}→${d.code}`),
  ];
}

// ── Règles appliquées, affichées dans le devis ─────────────────────────────────

/** Une règle à afficher : clé de traduction (route.rule_*) et ses paramètres. `warn` : incohérence à corriger. */
export type RouteRule = { key: string; params?: Record<string, string | number>; warn?: boolean };

/** Ce que le trajet implique pour la facture d'achat, la TVA et la copie privée, dans l'ordre du devis. */
export function routeRules(c: CostSettings, route: Route): RouteRule[] {
  const rules: RouteRule[] = [];
  const supplier = route.supplier;
  const channel = route.channel ?? "b2c";
  const home = findCountry(c, c.home);
  const from = findCountry(c, route.buyFrom);
  const name = (code: string) => findCountry(c, code)?.name ?? code;

  // Achat
  if (supplier === "consumer") rules.push({ key: "rule_buy_consumer" });
  if (supplier === "business_margin") rules.push({ key: "rule_buy_business_margin" });
  if (supplier === "business") {
    if (route.buyFrom === c.home) rules.push({ key: "rule_buy_business_home", params: { pct: home?.vatPct ?? 0 } });
    else if (from?.eu !== false) rules.push({ key: "rule_buy_business_eu", params: { country: name(route.buyFrom), home: name(c.home) } });
  }
  if (from && !from.eu) rules.push({ key: "rule_buy_import", params: { country: from.name, home: name(c.home) } });
  if (supplier === "business" && route.vatScheme === "margin") rules.push({ key: "rule_warn_margin_not_allowed", warn: true });
  if (supplier && supplier !== "business" && route.vatScheme === "normal") rules.push({ key: "rule_warn_normal_costly", warn: true });

  // Vente
  const mix = route.sellTo === EU_MIX;
  const dests = destinations(c, route);
  const homeShare = Math.round((dests.find((d) => d.code === c.home)?.w ?? 0) * 100);
  if (mix) rules.push({ key: channel === "b2c" ? "rule_sell_marketplace" : "rule_sell_marketplace_b2b", params: { home: name(c.home), homeShare } });
  const dest = mix ? undefined : findCountry(c, route.sellTo);

  // TVA
  if (dest && !dest.eu) rules.push({ key: "rule_vat_export", params: { country: dest.name } });
  else if (route.vatScheme === "none") rules.push({ key: "rule_vat_none" });
  else if (route.vatScheme === "margin") rules.push({ key: channel === "b2c" ? "rule_vat_margin" : "rule_vat_margin_b2b", params: { country: name(c.home), pct: home?.vatPct ?? 0 } });
  else if (channel === "b2b") {
    if (!mix && route.sellTo === c.home) rules.push({ key: "rule_vat_b2b_home", params: { pct: home?.vatPct ?? 0 } });
    else rules.push({ key: "rule_vat_b2b_eu" });
  } else if (mix) rules.push({ key: "rule_vat_oss_mix", params: { pct: vatFor(c, route).pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) } });
  else if (route.sellTo === c.home) rules.push({ key: "rule_vat_normal_home", params: { pct: home?.vatPct ?? 0 } });
  else rules.push({ key: "rule_vat_oss", params: { country: dest?.name ?? route.sellTo, pct: dest?.vatPct ?? 0 } });

  // Copie privée
  if (channel === "b2b") {
    if (mix || route.sellTo === c.home) rules.push({ key: "rule_levy_b2b_home", params: { home: name(c.home) } });
    if (mix || route.sellTo !== c.home) rules.push({ key: "rule_levy_b2b_eu" });
  } else if (mix) {
    rules.push({ key: "rule_levy_mix", params: { home: name(c.home), homeShare } });
  } else if (dest && dest.code === c.home) {
    rules.push({ key: Object.keys(dest.levy).length ? "rule_levy_home" : "rule_levy_none", params: { country: dest.name } });
  } else if (dest && dest.eu) {
    rules.push({ key: Object.keys(dest.levy).some((k) => dest.levy[k as CostCategory]?.length) ? "rule_levy_distance" : "rule_levy_none", params: { country: dest.name } });
  }
  if (channel === "b2b") rules.push({ key: "rule_b2b_prices" });
  return rules;
}

// ── Déclaration de redevance (Copie France…) ──────────────────────────────────

/** Un appareil acheté, tel que le donnent les devis. */
export type LevyRow = {
  date: string;
  /** N° de devis ou de lot. */
  ref: string;
  /** Boutique ou client. */
  source: string;
  /** Pays d'achat ("FR" pour un rachat en boutique, celui du lot en B2B). */
  buyFrom: string;
  /** Pays de revente prévu, s'il est connu (EU_MIX : marketplace, réparti selon marketMix). */
  sellTo?: string;
  /** Revente à des particuliers ou à des professionnels (défaut : particuliers). */
  channel?: Channel;
  category: CostCategory;
  brand: string;
  model: string;
  storage?: string;
  quantity: number;
};

export type LevyLine = LevyRow & {
  bracket: string;
  unitLevy: number;
  /** Part des appareils revendus dans le pays déclaré (marketplace : sa part de la répartition). */
  share: number;
  total: number;
  /** Pourquoi la ligne est à 0 ou estimée. */
  note?: "unknown_storage" | "not_levied" | "resold_abroad" | "eu_mix";
};

export type LevySummary = { category: CostCategory; bracket: string; unitLevy: number; quantity: number; total: number };

const gbLabel = (gb: number) => (gb < 1 ? `${Math.round(gb * 1000)} Mo` : gb >= 1000 ? `${gb / 1000} To` : `${gb} Go`);

/** "> 32 Go ≤ 64 Go", "> 64 Go", "≤ 135 Mo". */
export function bracketLabel(brackets: LevyBracket[], gb: number | undefined): string {
  if (!brackets.length) return "—";
  let i = gb === undefined ? brackets.length - 1 : brackets.findIndex((b) => b.upToGb === null || gb <= b.upToGb);
  if (i < 0) i = brackets.length - 1;
  const lo = i > 0 ? brackets[i - 1].upToGb : null;
  const hi = brackets[i].upToGb;
  if (hi === null) return lo === null ? "toutes capacités" : `> ${gbLabel(lo)}`;
  return lo === null ? `≤ ${gbLabel(hi)}` : `> ${gbLabel(lo)} ≤ ${gbLabel(hi)}`;
}

/**
 * Redevance due dans `country` sur des appareils achetés, s'ils y sont revendus. Une ligne dont la
 * revente est prévue ailleurs compte 0 (exportation ou livraison dans un autre pays de l'UE).
 * Capacité inconnue : tranche la plus haute, signalée.
 */
export function levyReport(c: CostSettings, rows: LevyRow[], country: string) {
  const levy = findCountry(c, country)?.levy ?? {};
  const lines: LevyLine[] = rows.map((r) => {
    const brackets = levy[r.category] ?? [];
    const gb = storageGb(r.storage);
    const share = !r.sellTo || r.sellTo === country ? 1
      : r.sellTo === EU_MIX ? destinations(c, { buyFrom: r.buyFrom, sellTo: EU_MIX, vatScheme: "none" }).find((d) => d.code === country)?.w ?? 0
      : 0;
    if (share === 0) return { ...r, bracket: "—", unitLevy: 0, share: 0, total: 0, note: "resold_abroad" };
    if (!brackets.length) return { ...r, bracket: "—", unitLevy: 0, share, total: 0, note: "not_levied" };
    const unitLevy = levyFor(brackets, gb);
    return {
      ...r, bracket: bracketLabel(brackets, gb), unitLevy, share, total: Math.round(unitLevy * r.quantity * share * 100) / 100,
      ...(gb === undefined ? { note: "unknown_storage" as const } : share < 1 ? { note: "eu_mix" as const } : {}),
    };
  });
  const byKey = new Map<string, LevySummary>();
  for (const l of lines.filter((x) => x.unitLevy > 0)) {
    const key = `${l.category}|${l.bracket}`;
    const s = byKey.get(key) ?? { category: l.category, bracket: l.bracket, unitLevy: l.unitLevy, quantity: 0, total: 0 };
    s.quantity = Math.round((s.quantity + l.quantity * l.share) * 10) / 10;
    s.total = Math.round((s.total + l.total) * 100) / 100;
    byKey.set(key, s);
  }
  // Ordre du barème : catégorie, puis tranche croissante.
  const summary = [...byKey.values()].sort((a, b) => COST_CATEGORIES.indexOf(a.category) - COST_CATEGORIES.indexOf(b.category) || a.unitLevy - b.unitLevy);
  return {
    lines,
    summary,
    total: Math.round(summary.reduce((a, x) => a + x.total, 0) * 100) / 100,
    units: lines.reduce((a, l) => a + l.quantity, 0),
    leviedUnits: Math.round(summary.reduce((a, x) => a + x.quantity, 0) * 10) / 10,
    unknownStorage: lines.filter((l) => l.note === "unknown_storage").reduce((a, l) => a + l.quantity, 0),
  };
}

/** Date limite de déclaration Copie France : le 20 du mois qui suit `month` ("2026-10" → "2026-11-20"). */
export function declarationDeadline(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 20)).toISOString().slice(0, 10);
}

/** Bornes d'un mois ("2026-10") à l'heure locale, en ISO, pour filtrer des dates. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
}
