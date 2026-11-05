import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, PackageCheck, Truck } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
import { useExpeditions, useRetailQuotes } from "@/lib/retailQuotes";

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Parcels sent by the shops: receiving one moves its orders on and tells the shop. */
export default function Shipments() {
  const { t } = useTranslation();
  const { expeditions, loading, error, receive } = useExpeditions();
  const { quotes, reload } = useRetailQuotes();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);

  const markReceived = async (id: string) => {
    setBusy(id);
    setFailure(null);
    try {
      await receive(id);
      reload();
    } catch (e) {
      setFailure({ id, message: e instanceof Error ? e.message : t("all_quotes.action_error") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto pb-12">
      <PageHeader title={t("shipments.title")} desc={t("shipments.desc")} />

      {expeditions.map((exp) => {
        const waiting = quotes.filter((q) => q.shipmentId === exp.id && q.status === "Expédié").length;
        const author = [exp.createdBy?.prenom, exp.createdBy?.nom].filter(Boolean).join(" ");
        return (
          <Card key={exp.id} className="p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold">{exp.id}</span>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${exp.receivedAt ? "bg-lime/25 text-sell" : "bg-whisper text-hunter dark:bg-bright/10 dark:text-ink"}`}>
                {exp.receivedAt ? t("shipments.received", { date: day(exp.receivedAt) }) : t("shipments.in_transit")}
              </span>
            </div>
            <p className="text-sm text-muted">
              <b className="text-ink">{exp.magasin || "–"}</b>
              {author && ` · ${author}`}{exp.carrier && ` · ${exp.carrier}`}
              {exp.trackingNumber && <> · <span className="font-mono">{exp.trackingNumber}</span></>}
            </p>
            <p className="text-xs text-muted">{t("shipments.summary", { date: day(exp.createdAt), orders: exp.orderIds.length, devices: exp.deviceCount, value: exp.totalValue })}</p>
            {failure?.id === exp.id && <p className="text-sm text-warn font-semibold">{failure.message}</p>}
            {waiting > 0 && (
              <Button className="self-end" onClick={() => markReceived(exp.id)} disabled={busy === exp.id}>
                {busy === exp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                {t("shipments.mark_received")}
              </Button>
            )}
          </Card>
        );
      })}

      {expeditions.length === 0 && (
        <Card className="p-12 flex flex-col items-center gap-3 text-center">
          <Truck className="w-10 h-10 text-muted" />
          <p className="font-semibold">{loading ? t("shop_prices.loading") : error ?? t("shipments.empty")}</p>
        </Card>
      )}
    </div>
  );
}
