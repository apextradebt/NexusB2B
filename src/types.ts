export type Category = "phone" | "laptop";

/** B2B supply grades (same Class A–E scale as the supplier pivot). */
export type Grade = "A" | "B" | "C" | "D" | "E";
export const GRADES: Grade[] = ["A", "B", "C", "D", "E"];

/** One reference device the matcher can resolve an input line to. */
export type RefModel = {
  id: string;
  category: Category;
  brand: string;
  model: string;
  family?: string;
  year?: number;
  /** Laptop option lists (from the spec-verified catalog). */
  cpu?: string[];
  ram?: string[];
  ramAmd?: string[];
  storage?: string[];
  display?: string[];
  /** Phone reference price for a flawless device (shared with the B2C app). */
  basePrice?: number;
  source?: string;
  /** How the option lists were checked: manufacturer spec sheet, Lenovo PSREF, or the platform's standard CPU list. */
  verified?: "spec" | "psref" | "platform";
};

/** Specs pulled out of the raw text of a line. */
export type ParsedSpecs = {
  cpu?: string;
  cpuTier?: string;
  ram?: string;
  storage?: string;
};

/** Semantic fields an uploaded column can be mapped to. */
export type Field = "model" | "brand" | "quantity" | "grade" | "cpu" | "ram" | "storage" | "serial" | "price" | "description" | "ignore";

export type ColumnMapping = Record<string, Field>;

/** A raw uploaded line after column mapping (one row, or one grade cell of a pivot). */
export type RawLine = {
  row: number;
  text: string;
  brand?: string;
  model?: string;
  quantity: number;
  gradeRaw?: string;
  serial?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  /** Raw price cell (price lists), parsed with parsePrice. */
  price?: string;
};

export type MatchStatus = "matched" | "review" | "unmatched";

export type Match = {
  ref?: RefModel;
  score: number;
  status: MatchStatus;
  specs: ParsedSpecs;
  /** Variant resolved against the reference option lists (only values the model actually offers). */
  variant: { cpu?: string; ram?: string; storage?: string };
  warnings: string[];
  alternatives: { ref: RefModel; score: number }[];
};

export type AgentOffer = {
  source: string;
  price: number;
  url?: string;
  /** All listings behind this price (the first is `url`). */
  links?: string[];
  /** Grade the source actually had, when different from the requested one. */
  grade?: Grade;
};

export type AgentResult = {
  agent: string;
  kind: "buyback" | "resale" | "estimate";
  status: "ok" | "empty" | "unavailable" | "error";
  offers: AgentOffer[];
  message?: string;
};

export type PriceState = "idle" | "queued" | "running" | "done";

/** A grouped quote line: identical device + variant + grade, quantities summed. */
export type QuoteLine = {
  key: string;
  refId?: string;
  category?: Category;
  brand: string;
  model: string;
  variant: { cpu?: string; ram?: string; storage?: string };
  grade: Grade;
  gradeAssumed: boolean;
  quantity: number;
  status: MatchStatus;
  score: number;
  warnings: string[];
  sourceRows: number[];
  sampleText: string;
  priceState: PriceState;
  agentResults: AgentResult[];
  /** Unit prices in EUR. */
  marketBuy?: number;
  sellPrice?: number;
  buyPrice?: number;
  buyOverride?: number;
  priceBasis?: string;
  /** The customer's own selling price for this device (price list), after grade adjustment. */
  listPrice?: number;
  /** How the list price was found ("Grade B ajusté depuis A", "configuration partielle"…). */
  listPriceNote?: string;
  /** Median market resale found by the agents, kept for comparison when the list price is used. */
  marketSell?: number;
};

/** One of the customer's own selling prices. Empty variant fields / grade = applies to any. */
export type PriceListEntry = {
  id: string;
  refId: string;
  category: Category;
  brand: string;
  model: string;
  variant: { cpu?: string; ram?: string; storage?: string };
  grade?: Grade;
  /** Unit selling price, EUR. */
  price: number;
  updatedAt: string;
  source: "manual" | "import";
};

export type PricingSettings = {
  targetMarginPct: number;
  refurbCost: Record<Category, Record<Grade, number>>;
  /** Share of the grade-A value kept per grade, used only for catalog estimates. */
  gradeCoef: Record<Grade, number>;
  defaultGrade: Grade;
  agentConcurrency: number;
  /** "mine": the customer's price list is the resale price; "prudent": the lower of it and the market. */
  listPriceMode: "mine" | "prudent";
};

/** Lifecycle of a quote once saved, in order. */
export type QuoteStatus = "created" | "approved" | "shipped" | "arrived" | "in_progress" | "completed" | "paid";
export const QUOTE_STATUSES: QuoteStatus[] = ["created", "approved", "shipped", "arrived", "in_progress", "completed", "paid"];

export type SavedQuote = {
  id: string;
  client: string;
  reference: string;
  createdAt: string;
  fileName: string;
  lines: QuoteLine[];
  totals: { units: number; buy: number; sell: number; margin: number };
  /** Missing on quotes saved before statuses existed: read as "created". */
  status?: QuoteStatus;
  statusHistory?: { status: QuoteStatus; at: string }[];
};
