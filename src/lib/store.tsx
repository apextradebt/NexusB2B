import { createContext, useContext, useEffect, useState } from "react";
import type { Grade, PriceListEntry, PricingSettings, QuoteLine, QuoteStatus, RefModel, SavedQuote } from "@/types";
import type { Layout, Table } from "@/lib/parse";
import { DEFAULT_SETTINGS } from "@/lib/pricing";
import { entryKey, newEntryId, upsertEntries } from "@/lib/priceList";

// Browser storage can be unavailable (private mode, blocked site data): never let that break the app.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

/** The quote being built. Lives above the router so switching pages does not lose work. */
export type Draft = {
  step: number;
  fileName: string;
  client: string;
  reference: string;
  table?: Table;
  layout?: Layout;
  lines: QuoteLine[];
  savedId?: string;
};

const EMPTY_DRAFT: Draft = { step: 0, fileName: "", client: "", reference: "", lines: [] };

type Store = {
  settings: PricingSettings;
  setSettings: (s: PricingSettings) => void;
  quotes: SavedQuote[];
  saveQuote: (q: SavedQuote) => void;
  deleteQuote: (id: string) => void;
  setQuoteStatus: (id: string, status: QuoteStatus) => void;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  resetDraft: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  /** The customer's own selling prices. */
  priceList: PriceListEntry[];
  addPrices: (entries: PriceListEntry[]) => void;
  updatePrice: (id: string, patch: Partial<PriceListEntry>) => void;
  deletePrice: (id: string) => void;
  setPrice: (ref: RefModel, variant: PriceListEntry["variant"], grade: Grade | undefined, price: number | undefined) => void;
  clearPrices: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<PricingSettings>(() => load("b2b-pricing-settings", DEFAULT_SETTINGS));
  const [quotes, setQuotes] = useState<SavedQuote[]>(() => loadList("b2b-quotes"));
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return JSON.parse(localStorage.getItem("b2b-theme") || '"light"') === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    save("b2b-theme", theme);
  }, [theme]);

  const setSettings = (s: PricingSettings) => {
    setSettingsState(s);
    save("b2b-pricing-settings", s);
  };
  // Re-saving from the Prices step replaces lines and totals but keeps the creation date and the status trail.
  const saveQuote = (q: SavedQuote) =>
    setQuotes((prev) => {
      const old = prev.find((p) => p.id === q.id);
      const merged: SavedQuote = old
        ? { ...q, createdAt: old.createdAt, status: old.status, statusHistory: old.statusHistory }
        : { ...q, status: "created", statusHistory: [{ status: "created", at: q.createdAt }] };
      const next = [merged, ...prev.filter((p) => p.id !== q.id)];
      save("b2b-quotes", next);
      return next;
    });
  const setQuoteStatus = (id: string, status: QuoteStatus) =>
    setQuotes((prev) => {
      const next = prev.map((p) =>
        p.id !== id || (p.status ?? "created") === status
          ? p
          : {
              ...p,
              status,
              statusHistory: [...(p.statusHistory ?? [{ status: "created", at: p.createdAt }]), { status, at: new Date().toISOString() }],
            },
      );
      save("b2b-quotes", next);
      return next;
    });
  const deleteQuote = (id: string) =>
    setQuotes((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save("b2b-quotes", next);
      return next;
    });

  const [priceList, setPriceList] = useState<PriceListEntry[]>(() => loadList("b2b-price-list"));
  const editPrices = (fn: (prev: PriceListEntry[]) => PriceListEntry[]) =>
    setPriceList((prev) => {
      const next = fn(prev);
      save("b2b-price-list", next);
      return next;
    });
  const addPrices = (entries: PriceListEntry[]) => editPrices((prev) => upsertEntries(prev, entries));
  const updatePrice = (id: string, patch: Partial<PriceListEntry>) =>
    editPrices((prev) => {
      const edited = prev.find((e) => e.id === id);
      if (!edited) return prev;
      // Changing the model, configuration or grade can make it a duplicate of another entry: merge them.
      return upsertEntries(prev.filter((e) => e.id !== id), [{ ...edited, ...patch, updatedAt: new Date().toISOString() }]);
    });
  const deletePrice = (id: string) => editPrices((prev) => prev.filter((e) => e.id !== id));
  /** Set (or with `price` undefined, remove) the price of one exact model + configuration + grade. */
  const setPrice = (ref: RefModel, variant: PriceListEntry["variant"], grade: Grade | undefined, price: number | undefined) =>
    editPrices((prev) => {
      const clean = Object.fromEntries(Object.entries(variant).filter(([, v]) => v)) as PriceListEntry["variant"];
      const key = entryKey({ refId: ref.id, variant: clean, grade });
      const old = prev.find((e) => entryKey(e) === key);
      const rest = prev.filter((e) => entryKey(e) !== key);
      if (price === undefined) return rest;
      return [...rest, {
        id: old?.id ?? newEntryId(), refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model,
        variant: clean, grade, price: Math.round(price), updatedAt: new Date().toISOString(), source: "manual",
      }];
    });
  const clearPrices = () => editPrices(() => []);

  return (
    <Ctx.Provider
      value={{
        priceList, addPrices, updatePrice, deletePrice, setPrice, clearPrices,
        settings, setSettings, quotes, saveQuote, deleteQuote, setQuoteStatus, draft, setDraft,
        resetDraft: () => setDraft(EMPTY_DRAFT),
        theme, toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
