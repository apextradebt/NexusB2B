import { useTranslation } from "react-i18next";
import { costSplit, eur, SERVICE_ITEMS, TAX_ITEMS } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { EU_MIX, vatFor, type CostItem, type Route } from "@/lib/costs";
import type { QuoteLine } from "@/types";

/** " (palette)", " (colis)"… après le trajet. */
export const modeLabel = (t: (k: string) => string, mode?: string) => (mode ? ` (${t(`costs.mode_${mode}`)})` : "");
const cents = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Où va le prix de revente d'un appareil : l'achat, les taxes, le reste des coûts et ce qu'il nous reste. */
export default function CostPanel({ line, route }: { line: QuoteLine; route: Route }) {
  const { t } = useTranslation();
  const { settings } = useStore();
  const costs = line.costs!;
  const sell = line.sellPrice ?? 0;
  const net = line.netMargin ?? 0;
  const vat = vatFor(settings.costs, route);
  const { taxes, other } = costSplit(costs);

  const label = (k: CostItem) => k === "refurb" ? t("costs.refurb_grade", { grade: line.grade }) : t(`costs.${k}`, {
    from: route.buyFrom, to: route.sellTo === EU_MIX ? t("route.eu_mix_short") : route.sellTo, home: settings.costs.home,
    pct: vat.pct, country: vat.country ?? t("route.eu_mix_short"),
    mode: modeLabel(t, k === "inbound" ? costs.modes.inbound : k === "outbound" ? costs.modes.outbound : undefined),
  });
  const note = (k: CostItem) =>
    k === "vat" ? t(route.vatScheme === "margin" ? "costs.note_vat_margin" : "costs.note_vat_normal") : k === "levy" ? t("costs.note_levy") : undefined;

  const parts: { key: string; title: string; value: number; color: string; items?: CostItem[] }[] = [
    { key: "buy", title: t("costs.part_buy"), value: line.buyPrice ?? 0, color: "var(--series-1)" },
    { key: "taxes", title: t("costs.part_taxes"), value: taxes, color: "var(--series-2)", items: TAX_ITEMS },
    { key: "other", title: t("costs.part_other"), value: other, color: "var(--series-3)", items: SERVICE_ITEMS },
    { key: "net", title: t("costs.part_net"), value: net, color: "var(--series-4)" },
  ];
  const share = (v: number) => (sell > 0 ? t("costs.share", { pct: Math.round((v / sell) * 100) }) : "");

  return (
    <section className="rounded-2xl border border-line p-4 flex flex-col gap-3">
      <h4 className="font-bold text-sm">{t("costs.title", { price: eur(line.sellPrice) })}</h4>
      <div className="flex gap-0.5 h-3" aria-hidden="true">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} className="rounded-sm min-w-1" style={{ flexGrow: p.value, flexBasis: 0, background: p.color }} title={`${p.title} : ${eur(p.value)} (${share(p.value)})`} />
        ))}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {parts.map((p) => {
          const last = p.key === "net";
          return (
            <li key={p.key} className={last ? "border-t border-line pt-2" : ""}>
              <div className={`grid grid-cols-[0.75rem_1fr_auto_2.75rem] gap-x-2 items-baseline ${last ? "font-bold" : "font-semibold"}`}>
                <span className="w-2.5 h-2.5 rounded-sm self-center" style={{ background: p.color }} />
                <span>{p.title}</span>
                <span className={`text-right tabular-nums ${last && net < 0 ? "text-warn" : ""}`}>{eur(p.value)}</span>
                <span className="text-right tabular-nums text-xs font-medium text-muted">{share(p.value)}</span>
              </div>
              {last && line.sellPrice ? (
                <p className="pl-5 text-xs text-muted">{t("costs.net_note", { pct: Math.round((net / sell) * 100), target: settings.targetMarginPct })}</p>
              ) : null}
              {p.items?.some((k) => costs.items[k]) && (
                <ul className="mt-0.5 pl-5 pr-[3.25rem] flex flex-col gap-0.5 text-xs text-muted">
                  {p.items.filter((k) => costs.items[k]).map((k) => (
                    <li key={k}>
                      <div className="flex justify-between gap-3">
                        <span>{label(k)}</span>
                        <span className="tabular-nums whitespace-nowrap">{cents(costs.items[k]!)}</span>
                      </div>
                      {note(k) && <p className="text-[11px] opacity-80">{note(k)}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {costs.missingLanes.length > 0 && <p className="text-xs text-warn font-semibold">{t("route.missing_lane", { lanes: costs.missingLanes.join(", ") })}</p>}
    </section>
  );
}
