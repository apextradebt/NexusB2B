import { useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Select, StatusBadge } from "@/components/ui";
import { CATALOG, PHONE_STORAGE, getRef } from "@/lib/catalog";
import AddDeviceForm from "@/components/quote/AddDeviceForm";
import { matchAgainst } from "@/lib/match";
import { mergeDuplicates } from "@/lib/group";
import { useStore } from "@/lib/store";
import type { Grade, MatchStatus, QuoteLine } from "@/types";
import { GRADES } from "@/types";

type Filter = "all" | MatchStatus;

// Catalog as select options, grouped by category then brand.
const MODEL_OPTIONS = [
  { value: "", label: "— Non reconnu —" },
  ...CATALOG.map((r) => ({ value: r.id, label: `${r.category === "laptop" ? "PC" : "Tél."} · ${r.brand} ${r.model}` })),
];

export default function MatchStep() {
  const { t } = useTranslation();
  const { draft, setDraft } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const lines = draft.lines;
  const [adding, setAdding] = useState(lines.length === 0);

  const counts = useMemo(() => {
    const c = { all: 0, matched: 0, review: 0, unmatched: 0, units: 0 };
    for (const l of lines) {
      c.all++;
      c[l.status]++;
      c.units += l.quantity;
    }
    return c;
  }, [lines]);

  const update = (key: string, patch: (l: QuoteLine) => QuoteLine) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...patch(l), priceState: "idle", agentResults: [] } : l)) }));

  const pickModel = (l: QuoteLine, id: string) =>
    update(l.key, (cur) => {
      const ref = getRef(id);
      if (!ref) return { ...cur, refId: undefined, category: undefined, status: "unmatched", variant: {}, warnings: ["Exclu manuellement"] };
      const m = matchAgainst({ row: 0, text: cur.sampleText, quantity: cur.quantity }, ref);
      return { ...cur, refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model, variant: m.variant, status: "matched", score: 1, warnings: m.warnings };
    });

  const setVariant = (l: QuoteLine, field: "cpu" | "ram" | "storage", value: string) =>
    update(l.key, (cur) => ({ ...cur, variant: { ...cur.variant, [field]: value || undefined } }));

  const visible = filter === "all" ? lines : lines.filter((l) => l.status === filter);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: t("match.all") },
    { key: "review", label: t("match.review") },
    { key: "unmatched", label: t("match.unmatched") },
    { key: "matched", label: t("match.matched") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("match.units"), value: counts.units },
          { label: t("match.lines"), value: counts.all },
          { label: t("match.matched"), value: counts.matched, tone: "text-sell" },
          { label: t("match.to_check"), value: counts.review + counts.unmatched, tone: counts.review + counts.unmatched ? "text-warn" : "" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl shadow-inner-soft px-5 py-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">{s.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${s.tone ?? ""}`}>{s.value.toLocaleString("fr-FR")}</div>
          </div>
        ))}
      </div>

      {adding && <AddDeviceForm />}

      <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${filter === tab.key ? "shadow-soft-active text-primary" : "text-muted hover:text-ink"}`}
          >
            {tab.label} <span className="tabular-nums opacity-70">({tab.key === "all" ? counts.all : counts[tab.key]})</span>
          </button>
        ))}
      </div>
        <Button variant={adding ? "ghost" : "soft"} onClick={() => setAdding((a) => !a)}>
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {adding ? t("add.close") : t("add.open")}
        </Button>
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-3 font-semibold">{t("match.status")}</th>
              <th className="p-3 font-semibold min-w-64">{t("match.device")}</th>
              <th className="p-3 font-semibold min-w-72">{t("match.variant")}</th>
              <th className="p-3 font-semibold">{t("match.grade")}</th>
              <th className="p-3 font-semibold text-right">{t("match.qty")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => {
              const ref = getRef(l.refId);
              const opt = (xs?: string[]) => [{ value: "", label: "?" }, ...(xs || []).map((x) => ({ value: x, label: x }))];
              const ramOptions = l.variant.cpu?.startsWith("Ryzen") && ref?.ramAmd ? ref.ramAmd : ref?.ram;
              return (
                <tr key={l.key} className="border-t border-line align-top">
                  <td className="p-3 pt-5"><StatusBadge status={l.status} /></td>
                  <td className="p-3">
                    <Select value={l.refId || ""} onChange={(v) => pickModel(l, v)} options={MODEL_OPTIONS} className="w-full" ariaLabel={t("match.device")} />
                    <div className="text-xs text-muted font-mono mt-2 truncate max-w-md" title={l.sampleText}>
                      « {l.sampleText} » · {t("match.rows", { count: l.sourceRows.length })}
                    </div>
                  </td>
                  <td className="p-3">
                    {ref?.category === "laptop" ? (
                      <div className="flex flex-wrap gap-2">
                        <Select ariaLabel="CPU" value={l.variant.cpu || ""} onChange={(v) => setVariant(l, "cpu", v)} options={opt(ref.cpu)} className={!l.variant.cpu ? "text-warn" : ""} />
                        <Select ariaLabel="RAM" value={l.variant.ram || ""} onChange={(v) => setVariant(l, "ram", v)} options={opt(ramOptions)} className={!l.variant.ram ? "text-warn" : ""} />
                        <Select ariaLabel="Stockage" value={l.variant.storage || ""} onChange={(v) => setVariant(l, "storage", v)} options={opt(ref.storage)} className={!l.variant.storage ? "text-warn" : ""} />
                      </div>
                    ) : ref?.category === "phone" ? (
                      <Select ariaLabel="Capacité" value={l.variant.storage || ""} onChange={(v) => setVariant(l, "storage", v)}
                        options={opt(PHONE_STORAGE)} className={!l.variant.storage ? "text-warn" : ""} />
                    ) : (
                      <span className="text-muted text-xs">{t("match.not_priced")}</span>
                    )}
                    {l.warnings.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {l.warnings.map((w) => (
                          <li key={w} className="text-xs text-warn font-medium flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0" />{w}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-3">
                    <Select ariaLabel={t("match.grade")} value={l.grade} onChange={(v) => update(l.key, (cur) => ({ ...cur, grade: v as Grade, gradeAssumed: false }))}
                      options={GRADES.map((g) => ({ value: g, label: g }))} />
                    {l.gradeAssumed && <div className="text-[11px] text-warn font-medium mt-1">{t("match.grade_assumed")}</div>}
                  </td>
                  <td className="p-3 pt-5 text-right font-bold tabular-nums">{l.quantity.toLocaleString("fr-FR")}</td>
                  <td className="p-3 pt-4">
                    <button onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))} aria-label={t("add.remove")}
                      className="p-1.5 rounded-full text-muted hover:text-warn"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="text-center text-muted py-10 font-medium">{t("match.empty")}</p>}
      </div>

      <div className="flex justify-end pt-4 border-t border-line">
        <Button onClick={() => setDraft((d) => ({ ...d, step: 3, lines: mergeDuplicates(d.lines) }))} disabled={counts.matched + counts.review === 0}>
          {t("match.price")} <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
