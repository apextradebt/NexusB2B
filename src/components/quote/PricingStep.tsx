import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, Download, Info, Loader2, RefreshCw, Save, FilePlus2, Check, ExternalLink, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tm } from "@/lib/messages";
import { Button, Chip, Stat } from "@/components/ui";
import SourcesPanel from "@/components/quote/SourcesPanel";
import RouteFields from "@/components/quote/RouteFields";
import CostPanel from "@/components/quote/CostPanel";
import MarketSignal from "@/components/quote/MarketSignal";
import { agentsFor, BACKEND_DOWN, LEGACY_API, pool, runAgents } from "@/lib/agents";
import { buyGap, costSplit, defaultRoute, eur, lotSize, MARKET_GAP, marginRate, marketGap, marketVerdict, priceLine, totals, unitMargin } from "@/lib/pricing";
import { exportCsv, exportXlsx } from "@/lib/export";
import { EU_MIX } from "@/lib/costs";
import { useStore } from "@/lib/store";
import type { AgentResult, QuoteLine } from "@/types";

const priceable = (l: QuoteLine) => l.status !== "unmatched" && !!l.refId;

// The header sits in its own table so it can stick to the top of the page while the rows
// scroll sideways on small screens; both tables share these fixed column widths.
const TABLE = "w-full min-w-[72rem] table-fixed text-sm";
const COLS = (
  <colgroup>
    <col />
    {[64, 64, 96, 116, 124, 130, 136, 96, 100, 44].map((w, i) => <col key={i} style={{ width: w }} />)}
  </colgroup>
);
/** Tint of the agents' columns, to keep market prices apart from ours. */
const MARKET_BAND = "bg-whisper/30 dark:bg-hunter/20";

export default function PricingStep() {
  const { t } = useTranslation();
  const { draft, setDraft, settings, saveQuote, resetDraft, priceList } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const stickyHead = useRef<HTMLDivElement>(null);
  const inFlight = useRef(new Map<string, Promise<AgentResult[]>>());

  // Prices are derived at render time so changing margin/refurb settings or the route updates the quote instantly.
  const route = draft.route ?? defaultRoute(settings);
  const lines = useMemo(() => {
    return draft.lines.map((l) => priceLine(l, settings, priceList, { route, ...lotSize(settings, draft.lines) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lines, settings, priceList, route.buyFrom, route.sellTo, route.vatScheme, route.supplier, route.channel]);
  const tot = totals(lines.filter(priceable));
  const toPrice = draft.lines.filter(priceable);
  const done = toPrice.filter((l) => l.priceState === "done").length;
  const running = toPrice.some((l) => l.priceState === "running" || l.priceState === "queued");

  const patch = (key: string, p: Partial<QuoteLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));

  const run = useCallback(async (onlyIdle: boolean) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const targets = draft.lines.filter((l) => priceable(l) && (!onlyIdle || l.priceState === "idle"));
    if (targets.length === 0) return;
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (targets.some((x) => x.key === l.key) ? { ...l, priceState: "queued" } : l)) }));
    const agents = agentsFor(settings.gradeCoef);
    await pool(targets, settings.agentConcurrency, async (line) => {
      patch(line.key, { priceState: "running" });
      // StrictMode (dev) starts the agents twice on mount: reuse the request
      // already sent for this line instead of scraping the device again.
      let request = inFlight.current.get(line.key);
      if (!request) {
        // Prix du relevé de la semaine affichés dès qu'ils arrivent ; ceux des agents
        // relancés sur le serveur les remplacent ensuite (agents.ts)
        request = runAgents(line, agents, (agentResults) => {
          if (!ctrl.signal.aborted) patch(line.key, { priceState: "done", agentResults });
        }).finally(() => inFlight.current.delete(line.key));
        inFlight.current.set(line.key, request);
      }
      const agentResults = await request;
      if (!ctrl.signal.aborted) patch(line.key, { priceState: "done", agentResults });
    }, ctrl.signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lines, settings]);

  // Start the agents on arrival for any line not priced yet.
  useEffect(() => {
    if (draft.lines.some((l) => priceable(l) && l.priceState === "idle")) run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => abort.current?.abort(), []);

  const baseName = `devis-${(draft.client || "b2b").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;
  const meta = { client: draft.client, reference: draft.reference, route };

  const save = () => {
    const id = draft.savedId || `B2B-${Date.now().toString(36).toUpperCase()}`;
    saveQuote({
      id, client: draft.client, reference: draft.reference, createdAt: new Date().toISOString(), fileName: draft.fileName,
      lines: draft.lines, totals: { units: tot.units, buy: tot.buy, sell: tot.sell, margin: tot.margin, costs: tot.costs }, route,
    });
    setDraft((d) => ({ ...d, savedId: id }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const marginPct = tot.sell > 0 ? Math.round((tot.margin / tot.sell) * 100) : undefined;
  const unpriced = lines.filter((l) => priceable(l) && l.priceState === "done" && l.buyPrice === undefined);
  const backendDown = unpriced.some((l) => l.agentResults.some((r) => r.status === "error" && r.message === BACKEND_DOWN));
  const excluded = lines.filter((l) => !priceable(l));
  const onList = lines.filter((l) => priceable(l) && l.listPrice !== undefined);
  const verdicts = lines.filter((l) => priceable(l) && l.priceState === "done")
    .flatMap((l) => [marketGap(l), buyGap(l)])
    .filter((g) => g !== undefined)
    .map(marketVerdict);
  const tooHigh = verdicts.filter((v) => v === "high").length;
  const tooLow = verdicts.filter((v) => v === "low").length;

  const head = (
    <>
      <tr className="text-xs">
        <th colSpan={3} />
        <th colSpan={2} className={`${MARKET_BAND} rounded-t-xl px-3 pt-2 pb-0.5 text-center font-bold`} title={t("pricing.market_note")}>
          {t("pricing.market_group")}
          <div className="text-[10px] font-medium text-muted">{t("pricing.market_group_hint")}</div>
        </th>
        <th colSpan={5} className="px-3 pt-2 pb-0.5 text-center font-bold">{t("pricing.quote_group")}</th>
        <th />
      </tr>
      <tr className="text-left text-xs uppercase tracking-wider text-muted">
        <th className="p-3 font-semibold">{t("match.device")}</th>
        <th className="p-3 font-semibold text-center">{t("match.grade")}</th>
        <th className="p-3 font-semibold text-right">{t("match.qty")}</th>
        <th className={`p-3 font-semibold text-right ${MARKET_BAND}`}>{t("pricing.market_buy")}</th>
        <th className={`p-3 font-semibold text-right ${MARKET_BAND}`}>{t("pricing.market_sell")}</th>
        <th className="p-3 font-semibold text-right">{t("pricing.sell")}</th>
        <th className="p-3 font-semibold text-right">{t("pricing.buy")}</th>
        <th className="p-3 font-semibold text-right">{t("pricing.unit_costs")}</th>
        <th className="p-3 font-semibold text-right">{t("pricing.unit_margin")}</th>
        <th className="p-3 font-semibold text-right">{t("pricing.line_total")}</th>
        <th className="p-3" />
      </tr>
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat label={t("pricing.total_buy")} value={eur(tot.buy)} tone="buy" hint={t("pricing.units_priced", { priced: tot.priced, units: tot.units })} />
        <Stat label={t("pricing.total_sell")} value={eur(tot.sell)} tone="sell" hint={onList.length ? t("pricing.on_list", { count: onList.length, total: toPrice.length }) : t("pricing.sell_hint")} />
        <Stat label={t("pricing.margin")} value={eur(tot.margin)} hint={marginPct !== undefined ? t("pricing.margin_hint", { pct: marginPct, target: settings.targetMarginPct, costs: eur(tot.costs) }) : undefined} />
        <div className="rounded-[2rem] hero-gradient text-bright p-6 flex flex-col gap-3 justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Bot className="w-4 h-4" /> {t("pricing.agents")}</div>
          <div className="text-3xl font-bold tabular-nums">{done}/{toPrice.length}</div>
          <div className="h-1.5 rounded-full bg-bright/20 overflow-hidden">
            <div className="h-full bg-lime transition-all" style={{ width: `${toPrice.length ? (done / toPrice.length) * 100 : 0}%` }} />
          </div>
          <button onClick={() => run(false)} disabled={running} className="self-start text-xs font-semibold inline-flex items-center gap-1.5 text-whisper hover:text-bright disabled:opacity-50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {running ? t("pricing.running") : t("pricing.rerun")}
          </button>
        </div>
      </div>

      <details className="rounded-2xl bg-whisper/30 dark:bg-hunter/20 px-5 py-4">
        <summary className="cursor-pointer text-sm font-bold">{t("route.summary", {
          from: route.buyFrom, to: route.sellTo === EU_MIX ? t("route.eu_mix_short") : route.sellTo,
          channel: t(`route.channel_${route.channel ?? "b2c"}`), vat: t(`route.vat_${route.vatScheme}`),
        })}</summary>
        <div className="mt-4"><RouteFields /></div>
      </details>

      {unpriced.length > 0 && (
        <p className="text-sm text-warn font-semibold bg-sand/15 rounded-2xl px-5 py-3">
          {backendDown ? t("pricing.backend_down", { url: LEGACY_API }) : t("pricing.unpriced", { count: unpriced.length })}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-2xl bg-whisper/30 dark:bg-hunter/20 px-5 py-3 text-sm">
        <p className="flex gap-2 min-w-0 flex-1 basis-96">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted" />
          <span>{t("pricing.market_note")} {t("pricing.market_rule", { pct: MARKET_GAP * 100 })}</span>
        </p>
        {verdicts.length > 0 && (
          <p className={`font-semibold whitespace-nowrap ${tooHigh + tooLow > 0 ? "text-warn" : "text-muted"}`}>
            {tooHigh + tooLow > 0 ? t("pricing.market_summary", { high: tooHigh, low: tooLow }) : t("pricing.market_all_ok")}
          </p>
        )}
      </div>

      <div>
       <div ref={stickyHead} aria-hidden="true" className="sticky top-18 md:top-0 z-20 overflow-hidden bg-surface border-b border-line">
        <table className={TABLE}>
          {COLS}
          <thead>{head}</thead>
        </table>
       </div>
       <div className="overflow-x-auto" onScroll={(e) => { if (stickyHead.current) stickyHead.current.scrollLeft = e.currentTarget.scrollLeft; }}>
        <table className={TABLE}>
          {COLS}
          <thead className="sr-only">{head}</thead>
          <tbody>
            {lines.filter(priceable).map((l) => {
              const margin = unitMargin(l);
              const isOpen = open === l.key;
              return (
                <Fragment key={l.key}>
                  <tr className="border-t border-line">
                    <td className="p-3">
                      <div className="font-semibold">{l.brand} {l.model}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {l.category === "laptop"
                          ? [l.variant.cpu, l.variant.ram, l.variant.storage].map((v, i) => <Chip key={i} muted={!v}>{v || "?"}</Chip>)
                          : <Chip muted={!l.variant.storage}>{l.variant.storage || "?"}</Chip>}
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold">{l.grade}</td>
                    <td className="p-3 text-right tabular-nums">{l.quantity.toLocaleString("fr-FR")}</td>
                    <td className={`p-3 text-right tabular-nums text-muted ${MARKET_BAND}`}>{l.priceState === "done" ? eur(l.marketBuy) : ""}</td>
                    <td className={`p-3 text-right tabular-nums text-muted ${MARKET_BAND}`}>
                      {l.priceState === "done" ? eur(l.marketSell) : <Loader2 className={`w-4 h-4 inline ${l.priceState === "running" ? "animate-spin" : "opacity-30"}`} />}
                      {l.priceBasis?.startsWith("Estimation") && <div className="text-[10px] font-bold uppercase tracking-wider text-warn">{t("pricing.kind_estimate")}</div>}
                      {(() => {
                        const resale = l.agentResults.filter((r) => r.kind === "resale" && r.status === "ok");
                        return resale.length > 0 && resale.every((r) => /indicatif/.test(r.message ?? "")) ? (
                          <div className="text-[10px] font-bold uppercase tracking-wider text-warn" title={t("pricing.indicative_hint")}>{t("pricing.indicative")}</div>
                        ) : null;
                      })()}
                      {l.priceState === "done" && (
                        <button
                          onClick={() => setOpen(isOpen ? null : l.key)}
                          aria-expanded={isOpen}
                          className="flex items-center justify-end gap-1 w-full text-[10px] font-semibold text-primary hover:underline whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {t("pricing.source_counts", {
                            buy: l.agentResults?.filter((r) => r.kind === "buyback" && r.status === "ok").reduce((acc, r) => acc + (r.offers?.length || 0), 0) || 0,
                            sell: l.agentResults?.filter((r) => r.kind === "resale" && r.status === "ok").reduce((acc, r) => acc + (r.offers?.length || 0), 0) || 0,
                          })}
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-sell">
                      {l.sellPrice !== undefined ? eur(l.sellPrice) : l.priceState === "done" ? "—" : ""}
                      <div className="flex flex-col items-end gap-0.5 mt-0.5">
                        {l.listPrice !== undefined ? (
                          <span title={tm(l.listPriceNote)} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sell bg-lime/20 rounded-full px-2 py-0.5 whitespace-nowrap">
                            <Tag className="w-3 h-3" /> {l.priceBasis?.startsWith("Votre") ? t("pricing.your_price") : t("pricing.your_price_is", { price: eur(l.listPrice) })}
                          </span>
                        ) : l.sellPrice !== undefined && (
                          <span title={t("pricing.market_suggestion_hint")} className="text-[10px] leading-tight font-bold uppercase tracking-wider text-muted">{t("pricing.market_suggestion")}</span>
                        )}
                        {l.listPriceNote && <span className="text-[10px] text-muted font-medium">{tm(l.listPriceNote)}</span>}
                        {l.priceState === "done" && <MarketSignal gap={marketGap(l)} market={l.marketSell} kind="sell" />}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <input
                        aria-label={t("pricing.buy")}
                        inputMode="numeric"
                        value={l.buyOverride ?? l.buyPrice ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, "");
                          patch(l.key, { buyOverride: v === "" ? undefined : Number(v) });
                        }}
                        className={`w-24 text-right bg-surface shadow-inner-soft rounded-xl px-3 py-1.5 font-bold tabular-nums text-buy focus:outline-none focus:ring-2 focus:ring-primary/40 ${l.buyOverride !== undefined ? "ring-2 ring-sand/60" : ""}`}
                      />
                      {l.priceState === "done" && <div className="mt-1"><MarketSignal gap={buyGap(l)} market={l.marketBuy} kind="buy" /></div>}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted">
                      {l.costs ? (
                        <button onClick={() => setOpen(isOpen ? null : l.key)} className="hover:underline" title={t("pricing.costs_hint")}>
                          {eur(l.costs.total)}
                          <div className="text-[10px] font-semibold whitespace-nowrap">{t("pricing.costs_split", { taxes: eur(costSplit(l.costs).taxes), other: eur(costSplit(l.costs).other) })}</div>
                        </button>
                      ) : "—"}
                    </td>
                    <td className={`p-3 text-right tabular-nums ${margin !== undefined && margin < 0 ? "text-warn font-bold" : ""}`}>
                      {eur(margin)}
                      {(() => {
                        const rate = marginRate(l);
                        if (rate === undefined) return null;
                        const low = rate * 100 < settings.targetMarginPct - 0.5;
                        return <div className={`text-[10px] font-semibold ${low ? "text-warn" : "text-muted"}`} title={low ? t("pricing.low_margin", { target: settings.targetMarginPct }) : undefined}>{Math.round(rate * 100)} %{low ? " ↓" : ""}</div>;
                      })()}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold">{l.buyPrice !== undefined ? eur(l.buyPrice * l.quantity) : "—"}</td>
                    <td className="p-3">
                      <button onClick={() => setOpen(isOpen ? null : l.key)} aria-expanded={isOpen} aria-label={t("pricing.details")} className="p-1.5 rounded-full text-muted hover:text-ink">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={11} className="px-3 py-4">
                        <div className="grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
                          {l.costs && <CostPanel line={l} route={route} />}
                          <SourcesPanel line={l} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
       </div>
      </div>

      {excluded.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-muted">{t("pricing.excluded", { count: excluded.reduce((a, l) => a + l.quantity, 0) })}</summary>
          <ul className="mt-3 flex flex-col gap-1 font-mono text-xs text-muted">
            {excluded.map((l) => <li key={l.key}>{l.quantity} × {l.sampleText}</li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-line">
        <Button variant="ghost" onClick={resetDraft}><FilePlus2 className="w-4 h-4" /> {t("pricing.new")}</Button>
        <div className="flex flex-wrap gap-3">
          <Button variant="soft" onClick={() => exportCsv(lines, baseName)}><Download className="w-4 h-4" /> CSV</Button>
          <Button variant="soft" onClick={() => exportXlsx(lines, baseName, meta)}><Download className="w-4 h-4" /> Excel</Button>
          <Button onClick={save}>{savedFlash ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {savedFlash ? t("pricing.saved") : t("pricing.save")}</Button>
        </div>
      </div>
    </div>
  );
}
