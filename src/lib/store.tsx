import { createContext, useContext, useEffect, useState } from "react";
import type { PricingSettings, QuoteLine, SavedQuote } from "@/types";
import type { Layout, Table } from "@/lib/parse";
import { DEFAULT_SETTINGS } from "@/lib/pricing";

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
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  resetDraft: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
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
  const saveQuote = (q: SavedQuote) =>
    setQuotes((prev) => {
      const next = [q, ...prev.filter((p) => p.id !== q.id)];
      save("b2b-quotes", next);
      return next;
    });
  const deleteQuote = (id: string) =>
    setQuotes((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save("b2b-quotes", next);
      return next;
    });

  return (
    <Ctx.Provider
      value={{
        settings, setSettings, quotes, saveQuote, deleteQuote, draft, setDraft,
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
