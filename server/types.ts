export type Category = "phone" | "laptop";
export type Grade = "A" | "B" | "C" | "D" | "E";
export type Kind = "buyback" | "resale";

export type Query = {
  category: Category;
  brand: string;
  model: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  grade: Grade;
};

/** One price seen on a source, before currency conversion. */
export type RawOffer = {
  kind: Kind;
  title: string;
  price: number;
  currency: "EUR" | "USD" | "GBP" | "CHF";
  url: string;
  /** Condition label as the source writes it ("Très bon état", "A2", "Sehr gut"…). */
  condition?: string;
  /** Our A–E grade when the source's condition could be mapped. */
  grade?: Grade;
  /** Set when the price is the source's best/max offer rather than the exact configuration. */
  note?: string;
};

export type Offer = RawOffer & { source: string; sourceName: string; country: string; priceEur: number };

export type SourceStatus = "ok" | "empty" | "blocked" | "robots" | "error" | "not_applicable";

export type SourceReport = {
  id: string;
  name: string;
  country: string;
  kinds: Kind[];
  status: SourceStatus;
  count: number;
  ms: number;
  message?: string;
};

export type Source = {
  id: string;
  name: string;
  country: string;
  site: string;
  kinds: Kind[];
  categories: Category[];
  /** Extra applicability rule (e.g. rebuy only trades Apple laptops). */
  supports?: (q: Query) => boolean;
  run: (q: Query) => Promise<RawOffer[]>;
};
