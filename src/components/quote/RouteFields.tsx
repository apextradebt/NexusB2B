import { ArrowRight, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui";
import { useStore } from "@/lib/store";
import { defaultRoute } from "@/lib/pricing";
import { findCountry, findLane, vatFor, type Route, type VatScheme } from "@/lib/costs";

/** Pays d'achat, pays de revente et régime de TVA du devis en cours. */
export default function RouteFields() {
  const { t } = useTranslation();
  const { draft, setDraft, settings } = useStore();
  const c = settings.costs;
  const route = draft.route ?? defaultRoute(settings);
  const set = (p: Partial<Route>) => setDraft((d) => ({ ...d, route: { ...route, ...p } }));
  const countries = [...c.countries].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((x) => ({ value: x.code, label: `${x.name} (${x.code})` }));
  const vat = vatFor(c, route);
  const home = findCountry(c, c.home);
  const missing = [
    !findLane(c, route.buyFrom, c.home) && `${route.buyFrom} → ${c.home}`,
    !findLane(c, c.home, route.sellTo) && `${c.home} → ${route.sellTo}`,
  ].filter(Boolean);
  const levy = findCountry(c, route.sellTo)?.levy;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.buy_from")}
          <Select ariaLabel={t("route.buy_from")} value={route.buyFrom} onChange={(v) => set({ buyFrom: v })} options={countries} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.sell_to")}
          <Select ariaLabel={t("route.sell_to")} value={route.sellTo} onChange={(v) => set({ sellTo: v })} options={countries} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.vat")}
          <Select ariaLabel={t("route.vat")} value={route.vatScheme} onChange={(v) => set({ vatScheme: v as VatScheme })}
            options={(["normal", "margin", "none"] as VatScheme[]).map((v) => ({ value: v, label: t(`route.vat_${v}`) }))} />
        </label>
      </div>
      <p className="text-xs text-muted font-medium flex flex-wrap items-center gap-1.5">
        {route.buyFrom} <ArrowRight className="w-3 h-3" /> {t("route.centre", { country: home?.name ?? c.home })} <ArrowRight className="w-3 h-3" /> {route.sellTo}
        <span>·</span>
        {vat.pct ? t("route.vat_applied", { pct: vat.pct, country: vat.country }) : t("route.no_vat")}
        <span>·</span>
        {levy?.phone?.length || levy?.tablet?.length ? t("route.levy_due", { country: route.sellTo }) : t("route.no_levy")}
      </p>
      {missing.length > 0 && (
        <p className="text-xs text-warn font-semibold flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {t("route.missing_lane", { lanes: missing.join(", ") })}
        </p>
      )}
    </div>
  );
}
