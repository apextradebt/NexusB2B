import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { useStore } from "@/lib/store";
import { defaultRoute } from "@/lib/pricing";
import { declarationDeadline, levyReport, monthBounds, type LevyRow } from "@/lib/costs";
import { exportLevyReport } from "@/lib/export";
import { QUOTE_STATUSES, type SavedQuote } from "@/types";

/** Mois précédent ("2026-10" le 1er novembre) : celui qu'on déclare. */
function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Date d'achat d'un lot : son passage à « Accepté » (ou plus loin). undefined s'il n'est pas acheté. */
export function boughtAt(q: SavedQuote): string | undefined {
  const approved = QUOTE_STATUSES.indexOf("approved");
  if (QUOTE_STATUSES.indexOf(q.status ?? "created") < approved) return undefined;
  return q.statusHistory?.find((h) => QUOTE_STATUSES.indexOf(h.status) >= approved)?.at ?? q.createdAt;
}

/**
 * Déclaration Copie France : les appareils des lots achetés dans le mois, avec la redevance due s'ils
 * sont revendus en France. Un lot dont la revente est prévue ailleurs compte 0.
 */
export default function CopieFranceCard() {
  const { t } = useTranslation();
  const { quotes, settings } = useStore();
  const [month, setMonth] = useState(lastMonth);

  const report = useMemo(() => {
    const { from, to } = monthBounds(month);
    const rows: LevyRow[] = quotes.flatMap((q) => {
      const at = boughtAt(q);
      if (!at || at < from || at >= to) return [];
      const route = q.route ?? defaultRoute(settings);
      return q.lines
        .filter((l) => l.status !== "unmatched" && l.refId && (l.category === "phone" || l.category === "laptop" || l.category === "tablet"))
        .map((l) => ({
          date: at.slice(0, 10), ref: q.id, source: q.client || "—", buyFrom: route.buyFrom, sellTo: route.sellTo, channel: route.channel,
          category: l.category as LevyRow["category"], brand: l.brand, model: l.model, storage: l.variant.storage, quantity: l.quantity,
        }));
    });
    return levyReport(settings.costs, rows, "FR");
  }, [quotes, settings, month]);

  return (
    <Card className="p-8 flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> {t("copie.title")}</h2>
        <p className="text-sm text-muted font-medium mt-1">{t("copie.desc")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("copie.month")}
          <Input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <Button variant="soft" disabled={report.units === 0} onClick={() => exportLevyReport(report, month)}>
          <Download className="w-4 h-4" /> {t("copie.download")}
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="text-xs text-muted uppercase tracking-wider">{t("copie.total")}</div><div className="text-xl font-bold tabular-nums">{report.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</div></div>
        <div><div className="text-xs text-muted uppercase tracking-wider">{t("copie.levied_units")}</div><div className="text-xl font-bold tabular-nums">{report.leviedUnits} / {report.units}</div></div>
        <div><div className="text-xs text-muted uppercase tracking-wider">{t("copie.deadline_label")}</div><div className="text-xl font-bold">{new Date(declarationDeadline(month)).toLocaleDateString("fr-FR")}</div></div>
        <div><div className="text-xs text-muted uppercase tracking-wider">{t("copie.unknown_storage")}</div><div className="text-xl font-bold tabular-nums">{report.unknownStorage}</div></div>
      </div>
      {report.summary.length > 0 && (
        <table className="w-full text-sm max-w-2xl">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-2 font-semibold">{t("copie.col_category")}</th><th className="p-2 font-semibold">{t("copie.col_bracket")}</th>
              <th className="p-2 font-semibold text-right">{t("copie.col_units")}</th><th className="p-2 font-semibold text-right">{t("copie.col_unit_levy")}</th><th className="p-2 font-semibold text-right">{t("copie.col_total")}</th>
            </tr>
          </thead>
          <tbody>
            {report.summary.map((s) => (
              <tr key={`${s.category}${s.bracket}`} className="border-t border-line">
                <td className="p-2">{t(`costs.cat_${s.category}`)}</td><td className="p-2">{s.bracket}</td>
                <td className="p-2 text-right tabular-nums">{s.quantity}</td>
                <td className="p-2 text-right tabular-nums">{s.unitLevy.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{s.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted">{t("copie.caveat_b2b")}</p>
    </Card>
  );
}
