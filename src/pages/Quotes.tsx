import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderOpen, Download, Trash2, FilePlus2, ArrowRight } from "lucide-react";
import { Button, Card, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/lib/store";
import { eur, priceLine } from "@/lib/pricing";
import { exportXlsx } from "@/lib/export";
import { QUOTE_STATUSES, type QuoteStatus, type SavedQuote } from "@/types";

const STATUS_STYLE: Record<QuoteStatus, string> = {
  created: "bg-bokara/10 text-muted dark:bg-bright/10",
  approved: "bg-sand/25 text-warn",
  shipped: "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink",
  arrived: "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink",
  in_progress: "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink",
  completed: "bg-lime/25 text-sell",
  paid: "bg-hunter text-bright dark:bg-lime dark:text-bokara",
};

const statusOf = (q: SavedQuote): QuoteStatus => q.status ?? "created";

/** When the quote entered its current status (falls back to creation for older quotes). */
function statusSince(q: SavedQuote) {
  const s = statusOf(q);
  const hit = [...(q.statusHistory ?? [])].reverse().find((h) => h.status === s);
  return hit?.at ?? q.createdAt;
}

export default function Quotes() {
  const { t } = useTranslation();
  const { quotes, deleteQuote, setQuoteStatus, setDraft, resetDraft, settings, priceList } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");

  const counts = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, quotes.filter((q) => statusOf(q) === s).length])) as Record<QuoteStatus, number>;
  const shown = filter === "all" ? quotes : quotes.filter((q) => statusOf(q) === filter);
  const statusOptions = QUOTE_STATUSES.map((s) => ({ value: s, label: t(`quotes.status.${s}`) }));

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto pb-12">
      <PageHeader
        title={t("quotes.title")}
        desc={t("quotes.desc")}
        actions={<Button onClick={() => { resetDraft(); navigate("/"); }}><FilePlus2 className="w-4 h-4" /> {t("sidebar.new_quote")}</Button>}
      />

      {quotes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 py-1 [scrollbar-width:none]" role="tablist" aria-label={t("quotes.status_label")}>
          {(["all", ...QUOTE_STATUSES] as const).map((s) => {
            const n = s === "all" ? quotes.length : counts[s];
            const active = filter === s;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(s)}
                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${active ? "bg-primary text-on-primary shadow-soft-sm" : "text-muted hover:text-ink hover:bg-line/50"} ${n === 0 && !active ? "opacity-50" : ""}`}
              >
                {s === "all" ? t("quotes.all") : t(`quotes.status.${s}`)}
                <span className="tabular-nums text-xs">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <Card className="p-12 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="w-10 h-10 text-muted" />
          <p className="font-semibold">{t("quotes.empty")}</p>
          {quotes.length === 0 && <p className="text-sm text-muted">{t("quotes.empty_hint")}</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shown.map((q) => {
            const pct = q.totals.sell > 0 ? Math.round((q.totals.margin / q.totals.sell) * 100) : undefined;
            const status = statusOf(q);
            const idx = QUOTE_STATUSES.indexOf(status);
            const next = QUOTE_STATUSES[idx + 1];
            return (
              <Card key={q.id} className="p-7 flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-muted">{q.id}</div>
                    <div className="text-lg font-bold truncate">{q.client || t("quotes.no_client")}</div>
                    <div className="text-sm text-muted">{q.reference || q.fileName} · {new Date(q.createdAt).toLocaleDateString("fr-FR")}</div>
                  </div>
                  <span className="bg-whisper text-hunter text-xs font-bold px-3 py-1 rounded-full tabular-nums whitespace-nowrap">
                    {q.totals.units.toLocaleString("fr-FR")} {t("quotes.units")}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider whitespace-nowrap ${STATUS_STYLE[status]}`}>
                      {t(`quotes.status.${status}`)}
                    </span>
                    <span className="text-xs text-muted">{t("quotes.since", { date: new Date(statusSince(q)).toLocaleDateString("fr-FR") })}</span>
                  </div>
                  <div className="flex gap-1" aria-hidden>
                    {QUOTE_STATUSES.map((s, i) => (
                      <div key={s} title={t(`quotes.status.${s}`)} className={`h-1.5 flex-1 rounded-full ${i <= idx ? (status === "paid" ? "bg-lime" : "bg-primary") : "bg-line"}`} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.total_buy")}</div><div className="font-bold text-buy tabular-nums">{eur(q.totals.buy)}</div></div>
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.total_sell")}</div><div className="font-bold text-sell tabular-nums">{eur(q.totals.sell)}</div></div>
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.margin")}</div><div className="font-bold tabular-nums">{eur(q.totals.margin)}{pct !== undefined && <span className="text-muted font-medium"> · {pct}%</span>}</div></div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    ariaLabel={t("quotes.status_label")}
                    value={status}
                    onChange={(v) => setQuoteStatus(q.id, v as QuoteStatus)}
                    options={statusOptions}
                  />
                  {next && (
                    <Button variant="soft" onClick={() => setQuoteStatus(q.id, next)}>
                      {t("quotes.next", { status: t(`quotes.status.${next}`) })} <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                  <Button variant="soft" onClick={() => {
                    setDraft({ step: 3, fileName: q.fileName, client: q.client, reference: q.reference, lines: q.lines, savedId: q.id });
                    navigate("/");
                  }}>
                    <FolderOpen className="w-4 h-4" /> {t("quotes.open")}
                  </Button>
                  <Button variant="ghost" onClick={() => exportXlsx(q.lines.map((l) => priceLine(l, settings, priceList)), q.id, q)}>
                    <Download className="w-4 h-4" /> Excel
                  </Button>
                  <Button variant="ghost" className="ml-auto" onClick={() => { if (confirm(t("quotes.confirm_delete"))) deleteQuote(q.id); }}>
                    <Trash2 className="w-4 h-4" /> {t("quotes.delete")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
