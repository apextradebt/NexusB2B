import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, Download, Loader2, RefreshCw, Save, FilePlus2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Stat } from "@/components/ui";
import { agentsFor, pool, runAgents } from "@/lib/agents";
import { eur, priceLine, totals } from "@/lib/pricing";
import { exportCsv, exportXlsx } from "@/lib/export";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import type { QuoteLine } from "@/types";

const priceable = (l: QuoteLine) => l.status !== "unmatched" && !!l.refId;

export default function PricingStep() {
  const { t } = useTranslation();
  const { draft, setDraft, settings, saveQuote, resetDraft } = useStore();
  const { getToken } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Prices are derived at render time so changing margin/refurb settings updates the quote instantly.
  const lines = useMemo(() => draft.lines.map((l) => priceLine(l, settings)), [draft.lines, settings]);
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
    const token = await getToken();
    const agents = agentsFor(settings.gradeCoef);
    await pool(targets, settings.agentConcurrency, async (line) => {
      patch(line.key, { priceState: "running" });
      const agentResults = await runAgents(line, agents, token);
      if (!ctrl.signal.aborted) patch(line.key, { priceState: "done", agentResults });
    }, ctrl.signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lines, settings, getToken]);

  // Start the agents on arrival for any line not priced yet.
  useEffect(() => {
    if (draft.lines.some((l) => priceable(l) && l.priceState === "idle")) run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => abort.current?.abort(), []);

  const baseName = `devis-${(draft.client || "b2b").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;
  const meta = { client: draft.client, reference: draft.reference };

  const save = () => {
    const id = draft.savedId || `B2B-${Date.now().toString(36).toUpperCase()}`;
    saveQuote({
      id, client: draft.client, reference: draft.reference, createdAt: new Date().toISOString(), fileName: draft.fileName,
      lines: draft.lines, totals: { units: tot.units, buy: tot.buy, sell: tot.sell, margin: tot.margin },
    });
    setDraft((d) => ({ ...d, savedId: id }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const marginPct = tot.sell > 0 ? Math.round((tot.margin / tot.sell) * 100) : undefined;
  const unpriced = lines.filter((l) => priceable(l) && l.priceState === "done" && l.buyPrice === undefined);
  const excluded = lines.filter((l) => !priceable(l));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat label={t("pricing.total_buy")} value={eur(tot.buy)} tone="buy" hint={t("pricing.units_priced", { priced: tot.priced, units: tot.units })} />
        <Stat label={t("pricing.total_sell")} value={eur(tot.sell)} tone="sell" hint={t("pricing.sell_hint")} />
        <Stat label={t("pricing.margin")} value={eur(tot.margin)} hint={marginPct !== undefined ? t("pricing.margin_hint", { pct: marginPct, target: settings.targetMarginPct }) : undefined} />
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

      {unpriced.length > 0 && (
        <p className="text-sm text-warn font-semibold bg-sand/15 rounded-2xl px-5 py-3">
          {t("pricing.unpriced", { count: unpriced.length })}
        </p>
      )}

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-3 font-semibold min-w-64">{t("match.device")}</th>
              <th className="p-3 font-semibold text-center">{t("match.grade")}</th>
              <th className="p-3 font-semibold text-right">{t("match.qty")}</th>
              <th className="p-3 font-semibold text-right">{t("pricing.market_buy")}</th>
              <th className="p-3 font-semibold text-right">{t("pricing.sell")}</th>
              <th className="p-3 font-semibold text-right">{t("pricing.buy")}</th>
              <th className="p-3 font-semibold text-right">{t("pricing.unit_margin")}</th>
              <th className="p-3 font-semibold text-right">{t("pricing.line_total")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lines.filter(priceable).map((l) => {
              const margin = l.sellPrice !== undefined && l.buyPrice !== undefined ? l.sellPrice - l.buyPrice : undefined;
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
                    <td className="p-3 text-right tabular-nums text-muted">{l.priceState === "done" ? eur(l.marketBuy) : ""}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-sell">
                      {l.priceState === "done" ? eur(l.sellPrice) : <Loader2 className={`w-4 h-4 inline ${l.priceState === "running" ? "animate-spin" : "opacity-30"}`} />}
                      {l.priceBasis?.startsWith("Estimation") && <div className="text-[10px] font-bold uppercase tracking-wider text-warn">{t("pricing.kind_estimate")}</div>}
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
                    </td>
                    <td className={`p-3 text-right tabular-nums ${margin !== undefined && margin < 0 ? "text-warn font-bold" : ""}`}>{eur(margin)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{l.buyPrice !== undefined ? eur(l.buyPrice * l.quantity) : "—"}</td>
                    <td className="p-3">
                      <button onClick={() => setOpen(isOpen ? null : l.key)} aria-expanded={isOpen} aria-label={t("pricing.details")} className="p-1.5 rounded-full text-muted hover:text-ink">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} className="px-3 pb-5">
                        <div className="rounded-2xl shadow-inner-soft p-5 flex flex-col gap-3 text-xs">
                          <div className="font-semibold text-sm">{l.priceBasis ?? t("pricing.no_basis")}</div>
                          {l.agentResults.length === 0 && <div className="text-muted">{t("pricing.no_results")}</div>}
                          {l.agentResults.map((r, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="font-bold w-40">{r.agent}</span>
                              <Chip>{t(`pricing.kind_${r.kind}`)}</Chip>
                              <span className={r.status === "ok" ? "text-sell font-semibold" : "text-muted"}>{t(`pricing.status_${r.status}`)}</span>
                              {r.message && <span className="text-muted">· {r.message}</span>}
                              {r.offers.map((o, j) => (
                                <a key={j} href={o.url} target="_blank" rel="noreferrer" className={`font-mono ${o.url ? "underline" : "pointer-events-none"}`}>
                                  {o.source} {eur(o.price)}
                                </a>
                              ))}
                            </div>
                          ))}
                          <div className="text-muted">{t("pricing.source_rows")} {l.sourceRows.slice(0, 30).join(", ")}{l.sourceRows.length > 30 ? "…" : ""}</div>
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
