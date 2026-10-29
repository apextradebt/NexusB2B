import { useEffect, useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Select, StatusBadge } from "@/components/ui";
import { CATALOG, getRef, phoneStorage } from "@/lib/catalog";
import AddDeviceForm from "@/components/quote/AddDeviceForm";
import { rematch } from "@/lib/match";
import { mergeDuplicates } from "@/lib/group";
import { sendFeedback } from "@/lib/feedback";
import { AI_MIN_MS } from "@/lib/aiMatch";
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
  const { draft, setDraft, settings } = useStore();
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
      if (!ref) return { ...cur, refId: undefined, category: undefined, status: "unmatched", variant: {}, warnings: ["Exclu manuellement"], edited: true, aiNote: undefined };
      const m = rematch(cur, ref);
      return { ...cur, refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model, variant: m.variant, status: "matched", score: 1, warnings: m.warnings, edited: true, aiNote: undefined };
    });

  const setVariant = (l: QuoteLine, field: "cpu" | "ram" | "storage", value: string) =>
    update(l.key, (cur) => ({ ...cur, variant: { ...cur.variant, [field]: value || undefined }, edited: true }));

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

      {draft.ai?.state === "running" && <AiProgress done={draft.ai.done ?? 0} total={draft.ai.total ?? 0} startedAt={draft.ai.run} />}
      {draft.ai && draft.ai.state !== "running" && (draft.ai.state !== "done" || draft.ai.asked > 0) && (
        <p role="status" className={`flex items-center gap-2 text-sm font-medium ${draft.ai.state === "error" ? "text-muted" : "text-primary"}`}>
          <Sparkles className="w-4 h-4" />
          {draft.ai.state === "done" && t("match.ai_done", { count: draft.ai.asked, changed: draft.ai.changed, rejected: draft.ai.rejected ?? 0, seconds: ((draft.ai.ms ?? 0) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) })}
          {draft.ai.state === "done" && !!draft.ai.failed && <span className="text-warn">{t("match.ai_failed", { count: draft.ai.failed })}</span>}
          {draft.ai.state === "error" && t("match.ai_error", { error: draft.ai.error })}
        </p>
      )}

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
                    {l.aiNote && (
                      <div className={`text-xs font-medium mt-1 flex items-center gap-1.5 ${l.aiNote === "rejected" ? "text-warn" : "text-primary"}`}>
                        <Sparkles className="w-3 h-3 shrink-0" /> {t(`match.ai_${l.aiNote}`)}
                      </div>
                    )}
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
                        options={opt(phoneStorage(ref))} className={!l.variant.storage ? "text-warn" : ""} />
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
                    <button onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key), removed: [...(d.removed ?? []), l] }))} aria-label={t("add.remove")}
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
        <Button
          onClick={() => {
            if (settings.shareCorrections) sendFeedback(draft);
            setDraft((d) => ({ ...d, step: 3, lines: mergeDuplicates(d.lines) }));
          }}
          disabled={counts.matched + counts.review === 0 || draft.ai?.state === "running"}
        >
          {t("match.price")} <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/** The AI check under way: lines answered so far, on a bar that eases ahead a little while a batch is out. */
function AiProgress({ done, total, startedAt }: { done: number; total: number; startedAt: number }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(4);
  useEffect(() => {
    const real = total ? (100 * done) / total : 0;
    // Creep towards the end of the batches being answered, never past 95 % before the answers are in.
    // and fill no faster than AI_MIN_MS, so a quick answer still reads as work being done.
    const id = setInterval(() => {
      const timeCap = (100 * (Date.now() - startedAt)) / AI_MIN_MS;
      setShown((s) => Math.min(95, timeCap, Math.max(real, s + (Math.min(95, real + 25) - s) * 0.12)));
    }, 60);
    return () => clearInterval(id);
  }, [done, total, startedAt]);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t("match.ai_running")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm font-medium text-primary">
        <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-pulse" /> {t("match.ai_running")}</span>
        {total > 0 && <span className="tabular-nums text-muted text-xs">{t("match.ai_progress", { done, total })}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full bg-lime transition-[width] duration-300 ease-out" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}
