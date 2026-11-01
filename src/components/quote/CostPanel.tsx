import { useTranslation } from "react-i18next";
import { eur } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { vatFor, type CostItem, type Route } from "@/lib/costs";
import type { QuoteLine } from "@/types";

const ORDER: CostItem[] = ["refurb", "inbound", "outbound", "duty", "levy", "eco", "handling", "fees", "vat"];
const cents = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ce qui sépare le prix de revente du prix d'achat, poste par poste, pour un appareil. */
export default function CostPanel({ line, route }: { line: QuoteLine; route: Route }) {
  const { t } = useTranslation();
  const { settings } = useStore();
  const costs = line.costs!;
  const vat = vatFor(settings.costs, route);
  const rows = ORDER.filter((k) => costs.items[k]);
  return (
    <section className="mb-4 rounded-2xl border border-line p-4 flex flex-col gap-2 max-w-md">
      <h4 className="font-bold text-sm">{t("costs.title")}</h4>
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted">{t("costs.sell")}</dt><dd className="text-right tabular-nums font-semibold text-sell">{eur(line.sellPrice)}</dd>
        {rows.map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted">
              {t(`costs.${k}`, { from: route.buyFrom, to: route.sellTo, home: settings.costs.home, pct: vat.pct, country: vat.country })}
            </dt>
            <dd className="text-right tabular-nums">− {cents(costs.items[k]!)}</dd>
          </div>
        ))}
        <dt className="text-muted">{t("costs.buy")}</dt><dd className="text-right tabular-nums text-buy">− {eur(line.buyPrice)}</dd>
        <dt className="font-bold border-t border-line pt-1">{t("costs.net")}</dt>
        <dd className={`text-right tabular-nums font-bold border-t border-line pt-1 ${(line.netMargin ?? 0) < 0 ? "text-warn" : ""}`}>{eur(line.netMargin)}</dd>
      </dl>
      {costs.missingLanes.length > 0 && <p className="text-xs text-warn font-semibold">{t("route.missing_lane", { lanes: costs.missingLanes.join(", ") })}</p>}
    </section>
  );
}
