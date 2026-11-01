import { ArrowRight, AlertTriangle, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui";
import { useStore } from "@/lib/store";
import { defaultRoute, lotSize } from "@/lib/pricing";
import {
  EU_MIX, findCountry, missingLanes, routeRules, schemeForSupplier,
  type Channel, type Route, type Supplier, type VatScheme,
} from "@/lib/costs";

/** Fournisseur, pays d'achat, clientèle, pays de revente et régime de TVA du devis, avec les règles qui en découlent. */
export default function RouteFields() {
  const { t } = useTranslation();
  const { draft, setDraft, settings } = useStore();
  const c = settings.costs;
  const route = draft.route ?? defaultRoute(settings);
  const set = (p: Partial<Route>) => setDraft((d) => ({ ...d, route: { ...route, ...p } }));
  const countries = [...c.countries].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((x) => ({ value: x.code, label: `${x.name} (${x.code})` }));
  const home = findCountry(c, c.home);
  const missing = missingLanes(c, route);
  const rules = routeRules(c, route);
  // Un gros lot arrive en plusieurs palettes ; il repart en colis vers les particuliers.
  const lot = lotSize(settings, draft.lines);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.supplier")}
          <Select ariaLabel={t("route.supplier")} value={route.supplier ?? "business"}
            // Le fournisseur fixe le régime de TVA possible : on le reprend, quitte à le changer ensuite.
            onChange={(v) => set({ supplier: v as Supplier, vatScheme: schemeForSupplier(v as Supplier) })}
            options={(["business", "business_margin", "consumer"] as Supplier[]).map((v) => ({ value: v, label: t(`route.supplier_${v}`) }))} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.buy_from")}
          <Select ariaLabel={t("route.buy_from")} value={route.buyFrom} onChange={(v) => set({ buyFrom: v })} options={countries} />
        </label>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.channel")}
          <Select ariaLabel={t("route.channel")} value={route.channel ?? "b2c"} onChange={(v) => set({ channel: v as Channel })}
            options={(["b2c", "b2b"] as Channel[]).map((v) => ({ value: v, label: t(`route.channel_${v}`) }))} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.sell_to")}
          <Select ariaLabel={t("route.sell_to")} value={route.sellTo} onChange={(v) => set({ sellTo: v })}
            options={[{ value: EU_MIX, label: t("route.eu_mix") }, ...countries]} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("route.vat")}
          <Select ariaLabel={t("route.vat")} value={route.vatScheme} onChange={(v) => set({ vatScheme: v as VatScheme })}
            options={(["normal", "margin", "none"] as VatScheme[]).map((v) => ({ value: v, label: t(`route.vat_${v}`) }))} />
        </label>
      </div>
      <p className="text-xs text-muted font-medium flex flex-wrap items-center gap-1.5">
        {route.buyFrom} <ArrowRight className="w-3 h-3" /> {t("route.centre", { country: home?.name ?? c.home })} <ArrowRight className="w-3 h-3" />
        {route.sellTo === EU_MIX ? t("route.eu_mix_short") : route.sellTo}
        {lot.lotUnits > 0 && <><span>·</span>{t("route.lot_pallets", { count: lot.lotPallets, units: lot.lotUnits })}</>}
      </p>
      <ul className="flex flex-col gap-1.5 rounded-2xl bg-surface/60 px-4 py-3">
        {rules.map((r) => (
          <li key={r.key} className={`text-xs flex gap-2 ${r.warn ? "text-warn font-semibold" : "text-ink"}`}>
            {r.warn ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted" />}
            <span>{t(`route.${r.key}`, r.params)}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <p className="text-xs text-warn font-semibold flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {t("route.missing_lane", { lanes: missing.join(", ") })}
        </p>
      )}
    </div>
  );
}
