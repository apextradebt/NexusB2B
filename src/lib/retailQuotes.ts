import { useCallback, useEffect, useState } from "react";
import { backendFetch } from "@/lib/api";
import type { RetailMessage, RetailQuote, RetailStatus } from "@/lib/allQuotes";

// B2C quotes from the shops (Nexus Back). They hold client details, so the backend only gives them
// to a signed-in admin or backoffice account: local mode without login never sees them.

/** Why the list is empty matters: `login` and `forbidden` need the user to do something. */
export type RetailState = "loading" | "ready" | "login" | "forbidden" | "unavailable";

const errorOf = async (res: Response) => {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || `HTTP ${res.status}`);
};

export function useRetailQuotes() {
  const [quotes, setQuotes] = useState<RetailQuote[]>([]);
  const [state, setState] = useState<RetailState>("loading");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch("/api/backoffice/devis");
        if (cancelled) return;
        if (res.status === 401) return setState("login");
        if (res.status === 403) return setState("forbidden");
        if (!res.ok) return setState("unavailable");
        const body = await res.json();
        if (cancelled) return;
        setQuotes(body.devis);
        setState("ready");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [version]);

  const advance = useCallback(async (id: string, status: RetailStatus) => {
    const res = await backendFetch(`/api/backoffice/devis/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw await errorOf(res);
    setQuotes((list) => list.map((q) => (q.id === id ? { ...q, status } : q)));
  }, []);

  const sendMessage = useCallback(async (id: string, text: string) => {
    const res = await backendFetch(`/api/backoffice/devis/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw await errorOf(res);
    const { message } = (await res.json()) as { message: RetailMessage };
    setQuotes((list) => list.map((q) => (q.id === id ? { ...q, messages: [...(q.messages ?? []), message] } : q)));
  }, []);

  return { quotes, state, reload, advance, sendMessage };
}

export type Expedition = {
  id: string;
  createdAt: string;
  orderIds: string[];
  deviceCount: number;
  totalValue: number;
  magasin?: string;
  carrier?: string;
  trackingNumber?: string;
  receivedAt?: string;
  createdBy?: { prenom: string; nom: string };
};

/** Parcels on their way from the shops to the processing centre. */
export function useExpeditions() {
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch("/api/backoffice/expeditions");
        if (!res.ok) throw await errorOf(res);
        const body = await res.json();
        if (!cancelled) setExpeditions(body.expeditions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const receive = useCallback(async (id: string) => {
    const res = await backendFetch(`/api/backoffice/expeditions/${encodeURIComponent(id)}/receive`, { method: "PUT" });
    if (!res.ok) throw await errorOf(res);
    const { receivedAt } = await res.json();
    setExpeditions((list) => list.map((e) => (e.id === id ? { ...e, receivedAt } : e)));
  }, []);

  return { expeditions, loading, error, receive };
}
