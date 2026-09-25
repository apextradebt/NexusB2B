import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderOpen, Download, Trash2, FilePlus2 } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { eur, priceLine } from "@/lib/pricing";
import { exportXlsx } from "@/lib/export";

export default function Quotes() {
  const { t } = useTranslation();
  const { quotes, deleteQuote, setDraft, resetDraft, settings } = useStore();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto pb-12">
      <PageHeader
        title={t("quotes.title")}
        desc={t("quotes.desc")}
        actions={<Button onClick={() => { resetDraft(); navigate("/"); }}><FilePlus2 className="w-4 h-4" /> {t("sidebar.new_quote")}</Button>}
      />

      {quotes.length === 0 ? (
        <Card className="p-12 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="w-10 h-10 text-muted" />
          <p className="font-semibold">{t("quotes.empty")}</p>
          <p className="text-sm text-muted">{t("quotes.empty_hint")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quotes.map((q) => {
            const pct = q.totals.sell > 0 ? Math.round((q.totals.margin / q.totals.sell) * 100) : undefined;
            return (
              <Card key={q.id} className="p-7 flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-muted">{q.id}</div>
                    <div className="text-lg font-bold">{q.client || t("quotes.no_client")}</div>
                    <div className="text-sm text-muted">{q.reference || q.fileName} · {new Date(q.createdAt).toLocaleDateString("fr-FR")}</div>
                  </div>
                  <span className="bg-whisper text-hunter text-xs font-bold px-3 py-1 rounded-full tabular-nums whitespace-nowrap">
                    {q.totals.units.toLocaleString("fr-FR")} {t("quotes.units")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.total_buy")}</div><div className="font-bold text-buy tabular-nums">{eur(q.totals.buy)}</div></div>
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.total_sell")}</div><div className="font-bold text-sell tabular-nums">{eur(q.totals.sell)}</div></div>
                  <div><div className="text-xs text-muted uppercase tracking-wider">{t("pricing.margin")}</div><div className="font-bold tabular-nums">{eur(q.totals.margin)}{pct !== undefined && <span className="text-muted font-medium"> · {pct}%</span>}</div></div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                  <Button variant="soft" onClick={() => {
                    setDraft({ step: 3, fileName: q.fileName, client: q.client, reference: q.reference, lines: q.lines, savedId: q.id });
                    navigate("/");
                  }}>
                    <FolderOpen className="w-4 h-4" /> {t("quotes.open")}
                  </Button>
                  <Button variant="ghost" onClick={() => exportXlsx(q.lines.map((l) => priceLine(l, settings)), q.id, q)}>
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
