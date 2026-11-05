import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, FolderOpen, Loader2, Search, Send, X } from "lucide-react";
import { Button, Card, Input, PageHeader, Stat } from "@/components/ui";
import { useStore } from "@/lib/store";
import { eur } from "@/lib/pricing";
import { matchesQuery, mergeQuotes, nextRetailStep, STAGES, type RetailStatus, type Stage, type UnifiedQuote } from "@/lib/allQuotes";
import { useRetailQuotes } from "@/lib/retailQuotes";
import { QUOTE_STATUSES, type QuoteStatus } from "@/types";

type Source = "all" | "b2b" | "b2c";

const STAGE_STYLE: Record<Stage, string> = {
  open: "bg-bokara/10 text-muted dark:bg-bright/10",
  accepted: "bg-sand/25 text-warn",
  transit: "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink",
  processing: "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink",
  done: "bg-lime/25 text-sell",
  refused: "bg-warn/15 text-warn",
};

const chip = (active: boolean) =>
  `shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${active ? "bg-primary text-on-primary shadow-sm" : "bg-surface text-muted hover:text-ink"}`;

const head = "py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap";
const cell = "py-3 px-3 text-sm";
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Every quote in one place: B2B lots from this browser and B2C buybacks from the shops. */
export default function AllQuotes() {
  const { t } = useTranslation();
  const { quotes: b2b, setQuoteStatus, setDraft } = useStore();
  const { quotes: b2c, state, advance, sendMessage } = useRetailQuotes();
  const navigate = useNavigate();

  const [source, setSource] = useState<Source>("all");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const all = useMemo(() => mergeQuotes(b2b, b2c), [b2b, b2c]);
  const searched = useMemo(() => all.filter((q) => matchesQuery(q, query)), [all, query]);
  const inSource = source === "all" ? searched : searched.filter((q) => q.source === source);
  const shown = stage === "all" ? inSource : inSource.filter((q) => q.stage === stage);
  const open = all.find((q) => q.key === openKey) ?? null;

  const statusLabel = (q: UnifiedQuote) => (q.source === "b2b" ? t(`quotes.status.${q.status}`) : t(`all_quotes.b2c_status.${q.status}`));
  const sourceCount = (s: Source) => (s === "all" ? searched.length : searched.filter((q) => q.source === s).length);

  const openInEditor = (q: UnifiedQuote) => {
    if (q.source !== "b2b") return;
    const { fileName, client, reference, lines, id, route } = q.quote;
    setDraft({ step: 3, fileName, client, reference, lines, savedId: id, route });
    navigate("/");
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-12">
      <PageHeader title={t("all_quotes.title")} desc={t("all_quotes.desc")} />

      {state !== "ready" && (
        <Card className="p-4 flex items-center gap-3 text-sm">
          {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin text-muted shrink-0" /> : <AlertTriangle className="w-4 h-4 text-warn shrink-0" />}
          <span>{t(`all_quotes.b2c_${state}`)}</span>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={t("all_quotes.stat_quotes")} value={inSource.length} />
        <Stat label={t("all_quotes.stat_to_handle")} value={inSource.filter((q) => q.stage === "open" || q.stage === "accepted").length} />
        <Stat label={t("all_quotes.stat_buy")} value={eur(inSource.filter((q) => q.stage !== "refused").reduce((n, q) => n + q.buy, 0))} tone="buy" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("all_quotes.search")} aria-label={t("all_quotes.search")} className="w-full pl-10" />
          </div>
          <div className="flex gap-2" role="group" aria-label={t("all_quotes.source")}>
            {(["all", "b2b", "b2c"] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)} aria-pressed={source === s} className={chip(source === s)}>
                {t(`all_quotes.source_${s}`)} <span className="tabular-nums text-xs">{sourceCount(s)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 py-1 [scrollbar-width:none]" role="group" aria-label={t("all_quotes.stage")}>
          {(["all", ...STAGES] as const).map((s) => (
            <button key={s} onClick={() => setStage(s)} aria-pressed={stage === s} className={chip(stage === s)}>
              {t(`all_quotes.stage_${s}`)}
              <span className="tabular-nums text-xs">{s === "all" ? inSource.length : inSource.filter((q) => q.stage === s).length}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="p-2 sm:p-4 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className={head}>{t("all_quotes.col_quote")}</th>
              <th className={head}>{t("all_quotes.col_source")}</th>
              <th className={head}>{t("all_quotes.col_client")}</th>
              <th className={head}>{t("all_quotes.col_owner")}</th>
              <th className={head}>{t("all_quotes.col_devices")}</th>
              <th className={`${head} text-right`}>{t("pricing.total_buy")}</th>
              <th className={`${head} text-right`}>{t("all_quotes.col_margin")}</th>
              <th className={head}>{t("all_quotes.col_status")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((q) => (
              <tr key={q.key} onClick={() => setOpenKey(q.key)} className="border-b border-line/50 hover:bg-bg transition-colors cursor-pointer">
                <td className={cell}>
                  <button onClick={() => setOpenKey(q.key)} className="block font-mono text-xs whitespace-nowrap hover:underline">{q.id}</button>
                  <span className="block text-xs text-muted">{day(q.date)}</span>
                </td>
                <td className={cell}><span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-whisper text-hunter uppercase">{q.source}</span></td>
                <td className={`${cell} font-semibold`}>{q.client || t("quotes.no_client")}</td>
                <td className={`${cell} text-muted whitespace-nowrap`}>{q.owner || "–"}</td>
                <td className={`${cell} text-muted max-w-56 truncate`} title={q.summary}>{q.summary || t("all_quotes.units", { count: q.units })}</td>
                <td className={`${cell} text-right font-bold text-buy tabular-nums whitespace-nowrap`}>{eur(q.buy)}</td>
                <td className={`${cell} text-right tabular-nums whitespace-nowrap ${(q.margin ?? 0) < 0 ? "text-warn font-bold" : ""}`}>{q.margin === null ? "–" : eur(q.margin)}</td>
                <td className={cell}><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STAGE_STYLE[q.stage]}`}>{statusLabel(q)}</span></td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-muted font-medium">{t("all_quotes.empty")}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted -mt-4">{t("all_quotes.margin_note")}</p>

      {open && (
        <QuoteDetail
          key={open.key}
          quote={open}
          statusLabel={statusLabel(open)}
          onClose={() => setOpenKey(null)}
          onNextB2B={(status) => setQuoteStatus(open.id, status)}
          onOpenB2B={() => openInEditor(open)}
          onAdvance={(status) => advance(open.id, status)}
          onMessage={(text) => sendMessage(open.id, text)}
        />
      )}
    </div>
  );
}

function QuoteDetail({ quote, statusLabel, onClose, onNextB2B, onOpenB2B, onAdvance, onMessage }: {
  quote: UnifiedQuote;
  statusLabel: string;
  onClose: () => void;
  onNextB2B: (status: QuoteStatus) => void;
  onOpenB2B: () => void;
  onAdvance: (status: RetailStatus) => Promise<void>;
  onMessage: (text: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("all_quotes.action_error"));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (text) run(async () => { await onMessage(text); setDraft(""); });
  };

  const nextB2B = quote.source === "b2b" ? QUOTE_STATUSES[QUOTE_STATUSES.indexOf(quote.status) + 1] : undefined;
  const nextB2C = quote.source === "b2c" ? nextRetailStep(quote.status) : null;
  const facts: [string, string][] = [
    [t("all_quotes.col_client"), quote.client || t("quotes.no_client")],
    [t("all_quotes.col_owner"), quote.owner || "–"],
    [t("pricing.total_buy"), eur(quote.buy)],
    [t("pricing.total_sell"), quote.sell === null ? "–" : eur(quote.sell)],
    [t(quote.source === "b2b" ? "all_quotes.margin_net" : "all_quotes.margin_gross"), quote.margin === null ? "–" : eur(quote.margin)],
    [t("all_quotes.col_devices"), t("all_quotes.units", { count: quote.units })],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={quote.id}>
      <div className="absolute inset-0 bg-bokara/40 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-mono text-muted">{quote.id} · {quote.source.toUpperCase()} · {day(quote.date)}</div>
            <h2 className="text-xl font-bold">{statusLabel}</h2>
            <p className="text-sm text-muted">{quote.summary}</p>
          </div>
          <button onClick={onClose} aria-label={t("all_quotes.close")} className="p-2 -m-2 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {facts.map(([label, value]) => (
            <div key={label}><dt className="text-xs text-muted uppercase tracking-wider">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>
          ))}
        </dl>

        {quote.source === "b2c" && (
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-sm">{t("all_quotes.messages")}</h3>
            {(quote.quote.messages ?? []).map((m, i) => (
              <div key={i} className="p-3 rounded-xl bg-bg text-sm">
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="text-xs text-muted mt-1">{m.by} · {new Date(m.at).toLocaleString("fr-FR")}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                maxLength={1000}
                placeholder={t("all_quotes.message_placeholder")}
                aria-label={t("all_quotes.message_placeholder")}
                className="flex-1 min-w-0"
              />
              <Button onClick={send} disabled={busy || !draft.trim()} aria-label={t("all_quotes.send")}><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-warn font-semibold">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-line">
          {quote.source === "b2b" && (
            <Button variant="soft" onClick={onOpenB2B}><FolderOpen className="w-4 h-4" /> {t("quotes.open")}</Button>
          )}
          {nextB2B && (
            <Button onClick={() => onNextB2B(nextB2B)}>{t("quotes.next", { status: t(`quotes.status.${nextB2B}`) })} <ArrowRight className="w-4 h-4" /></Button>
          )}
          {nextB2C && (
            <Button onClick={() => run(() => onAdvance(nextB2C))} disabled={busy}>
              {t("quotes.next", { status: t(`all_quotes.b2c_status.${nextB2C}`) })} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          {quote.source === "b2c" && !nextB2C && <p className="text-xs text-muted mr-auto">{t(quote.status === "En boutique" ? "all_quotes.b2c_waiting_shipment" : "all_quotes.b2c_no_step")}</p>}
        </div>
      </Card>
    </div>
  );
}
