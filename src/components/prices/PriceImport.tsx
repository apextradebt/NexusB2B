import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ClipboardPaste, FileSpreadsheet, Grid3x3, Loader2, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Select, StatusBadge } from "@/components/ui";
import { parseText, readFile, type Layout, type Table } from "@/lib/parse";
import { detectPriceLayout, importRows, rowsToEntries, type ImportRow } from "@/lib/priceList";
import { eur } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { Field } from "@/types";

const FIELDS: Field[] = ["model", "description", "brand", "cpu", "ram", "storage", "grade", "price", "quantity", "serial", "ignore"];

/**
 * Import the customer's selling prices from any file: the same column detection and model matching
 * as quotes, with a price column expected (or one price column per grade). Every row is shown with
 * what was understood before anything is saved.
 */
export default function PriceImport({ onDone }: { onDone: (count: number) => void }) {
  const { t } = useTranslation();
  const { addPrices } = useStore();
  const [table, setTable] = useState<Table>();
  const [layout, setLayout] = useState<Layout>();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (tbl: Table, name: string) => {
    if (tbl.rows.length === 0) return setError(t("import.empty"));
    setError(null);
    setTable(tbl);
    setLayout(detectPriceLayout(tbl));
    setFileName(name);
    setExcluded(new Set());
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      accept(await readFile(file), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rows: ImportRow[] = useMemo(() => (table && layout ? importRows(table, layout) : []), [table, layout]);
  const importable = (r: ImportRow, i: number) => !r.problem && !excluded.has(i);
  const chosen = rows.filter(importable);
  const count = rowsToEntries(chosen).length;
  const problems = {
    no_model: rows.filter((r) => r.problem === "no_model").length,
    no_price: rows.filter((r) => r.problem === "no_price").length,
    currency: rows.filter((r) => r.problem === "currency").length,
  };

  const setField = (h: string, f: Field) => setLayout((l) => l && { ...l, mapping: { ...l.mapping, [h]: f } });
  const toggle = (i: number) => setExcluded((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  if (!table || !layout) {
    return (
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
          className={`rounded-[2rem] border-2 border-dashed p-8 flex flex-col items-center gap-4 text-center transition-colors ${dragging ? "border-primary bg-lime/10" : "border-line"}`}
        >
          <div className="w-14 h-14 rounded-full bg-surface shadow-soft flex items-center justify-center text-primary">
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileSpreadsheet className="w-6 h-6" />}
          </div>
          <div>
            <p className="font-bold">{t("prices.import_title")}</p>
            <p className="text-sm text-muted font-medium mt-1 max-w-xl">{t("prices.import_desc")}</p>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm" className="hidden" data-testid="price-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => inputRef.current?.click()} disabled={busy}><Upload className="w-4 h-4" /> {t("import.choose")}</Button>
            <Button variant="soft" onClick={() => setShowPaste((s) => !s)}><ClipboardPaste className="w-4 h-4" /> {t("import.paste")}</Button>
          </div>
        </div>
        {showPaste && (
          <div className="flex flex-col gap-3">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={t("prices.paste_placeholder")}
              className="bg-surface shadow-inner-soft rounded-2xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button className="self-end" disabled={!paste.trim()} onClick={() => accept(parseText(paste), t("import.pasted"))}>{t("import.analyse_paste")}</Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-warn">{error}</p>}
      </div>
    );
  }

  const pivot = Object.keys(layout.gradeColumns).length > 0;
  const hasPrice = pivot || Object.values(layout.mapping).includes("price");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{fileName}</span>
        <span className="text-muted">· {t("mapping.rows", { count: table.rows.length })}</span>
        {pivot && (
          <span className="inline-flex items-center gap-1.5 bg-lime/25 text-sell text-xs font-bold px-3 py-1 rounded-full">
            <Grid3x3 className="w-3.5 h-3.5" /> {t("prices.pivot", { grades: Object.values(layout.gradeColumns).join(", ") })}
          </span>
        )}
        <button onClick={() => { setTable(undefined); setLayout(undefined); }} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
          <X className="w-3.5 h-3.5" /> {t("prices.other_file")}
        </button>
      </div>

      {/* Column roles, editable: the preview below updates as soon as one changes. */}
      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div className="flex gap-3 min-w-max">
          {table.headers.map((h) => (
            <div key={h} className="w-40 flex flex-col gap-1.5">
              <div className="text-xs font-semibold truncate" title={h}>{h}</div>
              {layout.gradeColumns[h] ? (
                <div className="text-xs font-bold text-sell bg-lime/20 rounded-xl px-3 py-2">{t("prices.grade_col", { grade: layout.gradeColumns[h] })}</div>
              ) : (
                <Select ariaLabel={h} value={layout.mapping[h]} onChange={(v) => setField(h, v as Field)}
                  options={FIELDS.map((f) => ({ value: f, label: t(`fields.${f}`) }))}
                  className={`w-full ${layout.mapping[h] === "ignore" ? "text-muted" : ""}`} />
              )}
            </div>
          ))}
        </div>
      </div>
      {!hasPrice && <p className="text-sm text-warn font-semibold">{t("prices.need_price")}</p>}

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="bg-lime/25 text-sell px-3 py-1 rounded-full">{t("prices.ready", { count: chosen.length })}</span>
        {problems.no_model > 0 && <span className="bg-bokara/10 dark:bg-bright/10 text-muted px-3 py-1 rounded-full">{t("prices.no_model", { count: problems.no_model })}</span>}
        {problems.no_price > 0 && <span className="bg-sand/25 text-warn px-3 py-1 rounded-full">{t("prices.no_price", { count: problems.no_price })}</span>}
        {problems.currency > 0 && <span className="bg-sand/25 text-warn px-3 py-1 rounded-full">{t("prices.currency", { count: problems.currency })}</span>}
      </div>

      <div className="overflow-x-auto -mx-2 px-2 max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-2 w-8" />
              <th className="p-2 font-semibold min-w-56">{t("match.device")}</th>
              <th className="p-2 font-semibold text-center">{t("match.grade")}</th>
              <th className="p-2 font-semibold text-right">{t("prices.price")}</th>
              <th className="p-2 font-semibold">{t("prices.read_from")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-line ${r.problem || excluded.has(i) ? "opacity-55" : ""}`}>
                <td className="p-2">
                  <input type="checkbox" aria-label={t("prices.include")} checked={importable(r, i)} disabled={!!r.problem} onChange={() => toggle(i)} className="accent-[var(--primary)] w-4 h-4" />
                </td>
                <td className="p-2">
                  {r.match.ref ? (
                    <>
                      <div className="font-semibold flex items-center gap-2">{r.match.ref.brand} {r.match.ref.model} {r.match.status === "review" && <StatusBadge status="review" />}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {r.match.ref.category === "laptop"
                          ? [r.match.variant.cpu, r.match.variant.ram, r.match.variant.storage].map((v, k) => <Chip key={k} muted={!v}>{v || t("prices.any")}</Chip>)
                          : <Chip muted={!r.match.variant.storage}>{r.match.variant.storage || t("prices.any")}</Chip>}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">{t("prices.not_recognised")}</span>
                  )}
                </td>
                <td className="p-2 text-center font-bold">{r.grade ?? <span className="text-muted font-medium text-xs">{t("prices.any_grade")}</span>}</td>
                <td className="p-2 text-right tabular-nums font-semibold text-sell">
                  {r.price !== undefined ? (r.currency === "EUR" ? eur(r.price) : `${r.price} ${r.currency}`) : "—"}
                  {r.problem === "currency" && <div className="text-[10px] font-bold uppercase text-warn inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t("prices.not_eur")}</div>}
                </td>
                <td className="p-2 font-mono text-xs text-muted truncate max-w-72" title={r.line.text}>{r.line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-line">
        <Button variant="ghost" onClick={() => { setTable(undefined); setLayout(undefined); }}>{t("add.close")}</Button>
        <Button disabled={count === 0} onClick={() => { addPrices(rowsToEntries(chosen)); onDone(count); setTable(undefined); setLayout(undefined); }}>
          {t("prices.import_submit", { count })}
        </Button>
      </div>
    </div>
  );
}
