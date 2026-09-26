import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Select } from "@/components/ui";
import { phoneStorage } from "@/lib/catalog";
import { parsePrice } from "@/lib/parse";
import { entryKey, findListPrice } from "@/lib/priceList";
import { useStore } from "@/lib/store";
import type { Grade, PriceListEntry, RefModel } from "@/types";
import { GRADES } from "@/types";

type Variant = PriceListEntry["variant"];
const COLS: (Grade | undefined)[] = [undefined, ...GRADES];
const vKey = (v: Variant) => [v.cpu ?? "", v.ram ?? "", v.storage ?? ""].join("|");
const vLabel = (v: Variant) => [v.cpu, v.ram, v.storage].filter(Boolean).join(" · ");

/**
 * Every price of one model in a grid: configurations (phones: each capacity) × grades.
 * A cell saves on blur; clearing it removes the price. Empty cells show, greyed, the price
 * a quote would use today (from a less specific entry or another grade), so gaps are visible.
 */
export default function ModelPriceEditor({ model }: { model: RefModel }) {
  const { t } = useTranslation();
  const { priceList, setPrice, settings } = useStore();
  const entries = useMemo(() => priceList.filter((e) => e.refId === model.id), [priceList, model.id]);
  const [extra, setExtra] = useState<Variant[]>([]);
  const [cpu, setCpu] = useState("");
  const [ram, setRam] = useState("");
  const [storage, setStorage] = useState("");

  const rows: Variant[] = useMemo(() => {
    const seen = new Map<string, Variant>([["||", {}]]);
    if (model.category === "phone") for (const s of phoneStorage(model)) seen.set(vKey({ storage: s }), { storage: s });
    for (const v of [...entries.map((e) => e.variant), ...extra]) if (!seen.has(vKey(v))) seen.set(vKey(v), v);
    return [...seen.values()];
  }, [model, entries, extra]);

  const exact = (v: Variant, g?: Grade) => entries.find((e) => entryKey(e) === entryKey({ refId: model.id, variant: v, grade: g }));
  const derived = (v: Variant, g?: Grade) => (g ? findListPrice({ refId: model.id, variant: v, grade: g }, priceList, settings.gradeCoef)?.price : undefined);

  const ramOptions = cpu.startsWith("Ryzen") && model.ramAmd ? model.ramAmd : model.ram;
  const addRow = () => {
    const v = Object.fromEntries(Object.entries({ cpu, ram, storage }).filter(([, x]) => x)) as Variant;
    if (!Object.keys(v).length || rows.some((r) => vKey(r) === vKey(v))) return;
    setExtra((x) => [...x, v]);
    setCpu(""); setRam(""); setStorage("");
  };
  const removeRow = (v: Variant) => {
    for (const g of COLS) if (exact(v, g)) setPrice(model, v, g, undefined);
    setExtra((x) => x.filter((r) => vKey(r) !== vKey(v)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="p-1.5 font-semibold min-w-44">{model.category === "phone" ? t("add.capacity") : t("prices.configuration")}</th>
              {COLS.map((g) => <th key={g ?? "any"} className="p-1.5 font-semibold text-center">{g ?? t("prices.any_grade")}</th>)}
              <th className="p-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const any = !vLabel(v);
              return (
                <tr key={vKey(v)} className="border-t border-line">
                  <td className="p-1.5 text-xs font-semibold">{any ? <span className="text-muted">{model.category === "phone" ? t("prices.all_capacities") : t("prices.all_configs")}</span> : vLabel(v)}</td>
                  {COLS.map((g) => (
                    <td key={g ?? "any"} className="p-1">
                      <PriceCell
                        label={`${model.model} ${vLabel(v)} ${g ?? t("prices.any_grade")}`}
                        value={exact(v, g)?.price}
                        hint={derived(v, g)}
                        onCommit={(p) => setPrice(model, v, g, p)}
                      />
                    </td>
                  ))}
                  <td className="p-1 text-right">
                    {model.category === "laptop" && !any && (
                      <button onClick={() => removeRow(v)} aria-label={t("prices.remove_config")} className="p-1 rounded-full text-muted hover:text-warn"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {model.category === "laptop" && (
        <div className="flex flex-wrap items-end gap-2">
          <Select ariaLabel={t("fields.cpu")} value={cpu} onChange={(v) => { setCpu(v); setRam(""); }} options={[{ value: "", label: `${t("fields.cpu")} : ${t("prices.any")}` }, ...(model.cpu ?? []).map((x) => ({ value: x, label: x }))]} />
          <Select ariaLabel={t("fields.ram")} value={ram} onChange={setRam} options={[{ value: "", label: `RAM : ${t("prices.any")}` }, ...(ramOptions ?? []).map((x) => ({ value: x, label: x }))]} />
          <Select ariaLabel={t("fields.storage")} value={storage} onChange={setStorage} options={[{ value: "", label: `${t("fields.storage")} : ${t("prices.any")}` }, ...(model.storage ?? []).map((x) => ({ value: x, label: x }))]} />
          <Button variant="soft" onClick={addRow} disabled={!cpu && !ram && !storage}><Plus className="w-4 h-4" /> {t("prices.add_config")}</Button>
        </div>
      )}
      <p className="text-[11px] text-muted">{t("prices.grid_hint")}</p>
    </div>
  );
}

function PriceCell({ label, value, hint, onCommit }: { label: string; value?: number; hint?: number; onCommit: (p: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [synced, setSynced] = useState(value);
  // Follow outside changes (import, another cell merging into this entry).
  if (synced !== value) {
    setSynced(value);
    setDraft(value === undefined ? "" : String(value));
  }
  const commit = () => {
    const p = draft.trim() === "" ? undefined : parsePrice(draft)?.value;
    if (draft.trim() !== "" && p === undefined) return setDraft(value === undefined ? "" : String(value));
    if ((p === undefined ? undefined : Math.round(p)) !== value) onCommit(p);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      placeholder={hint !== undefined ? String(hint) : "—"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`w-20 text-right rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted/50 ${value !== undefined ? "bg-lime/15 font-bold text-sell" : "bg-surface shadow-inner-soft"}`}
    />
  );
}
