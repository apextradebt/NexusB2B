import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History, Loader2, RotateCcw, Search, Send, Sparkles, X } from "lucide-react";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import {
  demoShopPrices, downloadCsv, previewImport, priceRowsToCsv, publishImport, readPriceFile, restoreVersion, SHOP_GRADES, useShopPricing,
  type GradePrices, type ImportSummary, type ParsedPrices, type PriceSide, type ShopPriceRow,
} from "@/lib/shopPrices";

type Preview = { fileName: string; parsed: ParsedPrices; summary: ImportSummary | null };

const PAGE = 100;
const head = "py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap";
const cell = "py-2.5 px-3 text-sm whitespace-nowrap";
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR");
const amount = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n} €`);

const TEMPLATE: ShopPriceRow[] = [
  { category: "phone", brand: "Apple", model: "iPhone 13", storage: "128GB", buy: { A: 300, B: 250, C: 180, D: 90 }, sell: { A: 420, B: 360, C: 280, D: 160 } },
];

function Prices({ prices, className }: { prices: GradePrices; className: string }) {
  return (
    <>
      {SHOP_GRADES.map((g) => (
        <td key={g} className={`${cell} text-right tabular-nums ${prices[g] ? className : "text-muted/50"}`}>{amount(prices[g])}</td>
      ))}
    </>
  );
}

/** The prices the shops quote at: import, review, publish, and put an older version back. */
export default function ShopPrices() {
  const { t } = useTranslation();
  const { pricing, loading, error: loadError, reload } = useShopPricing();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [working, setWorking] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const input = useRef<HTMLInputElement>(null);
  const side = useRef<PriceSide>("buy");

  const rows = useMemo(() => pricing?.rows ?? [], [pricing]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.brand} ${r.model} ${r.storage}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const attempt = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shop_prices.import_error"));
    } finally {
      setWorking(false);
    }
  };

  const request = (p: Preview, remove: boolean) => ({ rows: p.parsed.rows, removeMissing: remove, fileName: p.fileName });

  /** Compares the file with the live list. Nothing is published here. */
  const review = async (next: Preview, remove: boolean) => {
    if (next.parsed.rows.length === 0) return setPreview(next);
    const { summary } = await previewImport(request(next, remove));
    setPreview({ ...next, summary });
  };

  const onFile = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setNotice(null);
    setRemoveMissing(false);
    attempt(async () => review({ fileName: file.name, parsed: await readPriceFile(file, side.current), summary: null }, false));
  };

  const loadDemo = () => {
    setNotice(null);
    setRemoveMissing(false);
    attempt(async () => review({ fileName: t("shop_prices.demo_name"), parsed: { rows: await demoShopPrices(), issues: [] }, summary: null }, false));
  };

  const publish = () => attempt(async () => {
    if (!preview) return;
    const published = await publishImport(request(preview, removeMissing));
    setNotice(t(preview.summary?.buyChanged ? "shop_prices.published" : "shop_prices.published_silent", { version: published.version }));
    setPreview(null);
    await reload();
  });

  const restore = async (version: number) => {
    setRestoring(version);
    await attempt(async () => {
      await restoreVersion(version);
      setNotice(t("shop_prices.restored", { version }));
      await reload();
    });
    setRestoring(null);
  };

  const summary = preview?.summary;
  const hasChanges = !!summary && summary.added + summary.changed + summary.removed > 0;
  const latest = pricing?.history[0];
  const counts = summary && [
    [t("shop_prices.added"), summary.added], [t("shop_prices.changed"), summary.changed],
    [t("shop_prices.missing"), summary.missing], [t("shop_prices.unchanged"), summary.unchanged],
  ] as const;

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-12">
      <PageHeader title={t("shop_prices.title", { company: pricing?.company ?? "" })} desc={t("shop_prices.desc")} />

      <Card className="p-5 sm:p-7 flex flex-col gap-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{t("shop_prices.import_title")}</h2>
            <p className="text-sm text-muted max-w-xl">{t("shop_prices.import_desc")}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button onClick={() => { side.current = "buy"; input.current?.click(); }} disabled={working}><FileSpreadsheet className="w-4 h-4" /> {t("shop_prices.import_buy")}</Button>
            <Button variant="soft" onClick={() => { side.current = "sell"; input.current?.click(); }} disabled={working}><FileSpreadsheet className="w-4 h-4" /> {t("shop_prices.import_sell")}</Button>
          </div>
        </div>
        <input ref={input} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="hidden" aria-label={t("shop_prices.file")} onChange={(e) => onFile(e.target.files?.[0])} />

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={loadDemo} disabled={working}><Sparkles className="w-4 h-4" /> {t("shop_prices.demo")}</Button>
          <Button variant="ghost" onClick={() => downloadCsv("modele-grille.csv", priceRowsToCsv(TEMPLATE))}><Download className="w-4 h-4" /> {t("shop_prices.template")}</Button>
          {rows.length > 0 && (
            <Button variant="ghost" onClick={() => downloadCsv(`grille-v${pricing?.version}.csv`, priceRowsToCsv(rows))}><Download className="w-4 h-4" /> {t("shop_prices.export")}</Button>
          )}
        </div>

        {notice && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-lime/20 text-sm">
            <span className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 shrink-0 text-sell" /> {notice}</span>
            <button onClick={() => setNotice(null)} aria-label={t("all_quotes.close")} className="text-muted hover:text-ink"><X className="w-4 h-4" /></button>
          </div>
        )}
        {(error || loadError) && <p className="text-sm text-warn font-semibold">{error ?? loadError}</p>}

        {preview && (
          <div className="flex flex-col gap-4 pt-5 border-t border-line">
            <div>
              <h3 className="font-bold">{t("shop_prices.preview_title", { file: preview.fileName })}</h3>
              <p className="text-sm text-muted">{t("shop_prices.preview_desc", { count: preview.parsed.rows.length })}</p>
            </div>

            {counts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {counts.map(([label, value]) => (
                  <div key={label} className="p-4 rounded-xl bg-bg"><p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted">{label}</p></div>
                ))}
              </div>
            )}

            {preview.parsed.issues.length > 0 && (
              <div className="p-4 rounded-xl bg-sand/25 text-sm flex flex-col gap-1">
                <p className="flex items-center gap-2 font-bold text-warn"><AlertTriangle className="w-4 h-4" /> {t("shop_prices.issues", { count: preview.parsed.issues.length })}</p>
                {preview.parsed.issues.slice(0, 10).map((issue, i) => (
                  <p key={i}>{t("shop_prices.issue_line", { line: issue.line })} {t(`shop_prices.issue.${issue.key}`, issue.values)}</p>
                ))}
              </div>
            )}

            {summary && summary.negativeMargins.length > 0 && (
              <div className="p-4 rounded-xl bg-warn/15 text-sm flex flex-col gap-1">
                <p className="flex items-center gap-2 font-bold text-warn"><AlertTriangle className="w-4 h-4" /> {t("shop_prices.negative", { count: summary.negativeMargins.length })}</p>
                {summary.negativeMargins.slice(0, 10).map((m) => <p key={m}>{m}</p>)}
              </div>
            )}

            {summary && summary.changes.length > 0 && (
              <div className="flex flex-col gap-1 text-sm max-h-52 overflow-y-auto">
                {summary.changes.map((c, i) => (
                  <p key={i} className="text-muted">
                    <span className="font-semibold text-ink">{c.label}</span> · {t(c.side === "buy" ? "shop_prices.col_buy" : "shop_prices.col_sell", { grade: c.grade })} : {amount(c.from)} → <b className="text-ink">{amount(c.to)}</b>
                  </p>
                ))}
              </div>
            )}

            {summary && (
              <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={removeMissing}
                  onChange={(e) => { const on = e.target.checked; setRemoveMissing(on); attempt(() => review(preview, on)); }}
                  className="w-4 h-4 mt-0.5 accent-[var(--primary)]"
                />
                <span>{t("shop_prices.remove_missing")}</span>
              </label>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={working}>{t("shop_prices.cancel")}</Button>
              <Button onClick={publish} disabled={working || !hasChanges}>
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t(summary?.buyChanged ? "shop_prices.publish" : "shop_prices.save")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-7 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">{t("shop_prices.grid_title")}</h2>
          <p className="text-sm text-muted">
            {loading ? t("shop_prices.loading") : latest
              ? t("shop_prices.grid_desc", { version: latest.version, count: rows.length, date: when(latest.publishedAt), by: latest.publishedBy })
              : t("shop_prices.grid_empty")}
          </p>
        </div>
        {rows.length > 0 && (
          <>
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("shop_prices.search")} aria-label={t("shop_prices.search")} className="w-full pl-10" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className={head}>{t("shop_prices.col_device")}</th>
                    <th className={head}>{t("shop_prices.col_storage")}</th>
                    {SHOP_GRADES.map((g) => <th key={g} className={`${head} text-right`}>{t("shop_prices.col_buy", { grade: g })}</th>)}
                    {SHOP_GRADES.map((g) => <th key={g} className={`${head} text-right`}>{t("shop_prices.col_sell", { grade: g })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, limit).map((r) => (
                    <tr key={`${r.category}|${r.model}|${r.storage}`} className="border-b border-line/50">
                      <td className={cell}><span className="block text-xs text-muted">{r.brand}</span><span className="font-semibold">{r.model}</span></td>
                      <td className={`${cell} text-muted`}>{r.storage || "–"}</td>
                      <Prices prices={r.buy} className="font-bold text-buy" />
                      <Prices prices={r.sell} className="text-sell" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > limit && (
              <Button variant="ghost" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>{t("shop_prices.show_more", { shown: limit, total: filtered.length })}</Button>
            )}
          </>
        )}
      </Card>

      {(pricing?.history.length ?? 0) > 1 && (
        <Card className="p-5 sm:p-7 flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><History className="w-5 h-5" /> {t("shop_prices.history")}</h2>
          {pricing!.history.map((v, i) => (
            <div key={v.version} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-bg">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{t("shop_prices.version", { version: v.version })}{v.fileName && <span className="font-normal text-muted"> · {v.fileName}</span>}</p>
                <p className="text-xs text-muted">{when(v.publishedAt)} · {v.publishedBy} · {t("all_quotes.units", { count: v.rowCount })}</p>
              </div>
              {i === 0
                ? <span className="text-xs font-bold px-3 py-1 rounded-full bg-lime/25 text-sell self-start sm:self-auto">{t("shop_prices.live")}</span>
                : <Button variant="soft" onClick={() => restore(v.version)} disabled={restoring !== null}>{restoring === v.version ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} {t("shop_prices.restore")}</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
