import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ExternalLink, Laptop, LineChart, Smartphone, Tablet, Watch } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, Chip, Input, PageHeader } from "@/components/ui";
import { LAPTOPS, PHONES } from "@/lib/catalog";
import { eur } from "@/lib/pricing";
import { normalize } from "@/lib/match";
import { latest, money, useTradeIn, type TradeInModel } from "@/lib/tradein";
import type { Category } from "@/types";

type Tab = Category | "tablet" | "watch";

/** What sets a tablet's or watch's variants apart: capacities, or case sizes. */
const variantValues = (m: TradeInModel) =>
  [...new Set(m.variants.map((v) => (m.category === "watch" ? v.size : v.storage)).filter((x): x is string => !!x))]
    .sort((a, b) => parseFloat(a) * (a.endsWith("TB") ? 1024 : 1) - parseFloat(b) * (b.endsWith("TB") ? 1024 : 1));

export default function Reference() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("laptop");
  const [q, setQ] = useState("");
  const tradeIn = useTradeIn();

  // Tablets and watches: known from the trade-in history only (not recognised in quotes yet).
  const others = useMemo(() => {
    if (tab !== "tablet" && tab !== "watch") return [];
    const nq = normalize(q);
    return Object.entries(tradeIn?.models ?? {})
      .filter(([k, m]) => m.category === tab && (!nq || normalize(k.replace("::", " ")).includes(nq)))
      .sort(([a, ma], [b, mb]) => a.split("::")[0].localeCompare(b.split("::")[0]) || mb.launch.localeCompare(ma.launch));
  }, [tab, q, tradeIn]);
  const countOf = (c: "tablet" | "watch") => Object.values(tradeIn?.models ?? {}).filter((m) => m.category === c).length;

  const list = useMemo(() => {
    if (tab !== "laptop" && tab !== "phone") return [];
    const src = tab === "laptop" ? LAPTOPS : PHONES;
    const nq = normalize(q);
    return nq ? src.filter((r) => normalize(`${r.brand} ${r.model} ${(r.cpu || []).join(" ")}`).includes(nq)) : src;
  }, [tab, q]);

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto pb-12">
      <PageHeader
        title={t("reference.title")}
        desc={t("reference.desc")}
        actions={
          <div className="relative sm:w-80">
            <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("reference.search")} className="w-full pl-10 rounded-full" />
          </div>
        }
      />
      <div role="tablist" className="flex gap-2">
        {([["laptop", Laptop, LAPTOPS.length], ["phone", Smartphone, PHONES.length], ["tablet", Tablet, countOf("tablet")], ["watch", Watch, countOf("watch")]] as const).map(([key, Icon, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${tab === key ? "shadow-soft-active text-primary" : "text-muted hover:text-ink"}`}>
            <Icon className="w-4 h-4" /> {t(`reference.${key}`)} <span className="opacity-70">({n})</span>
          </button>
        ))}
      </div>

      {tab === "tablet" || tab === "watch" ? (
        <Card className="p-2 sm:p-4 overflow-x-auto flex flex-col gap-2">
          <p className="text-xs text-muted px-3 pt-2">{t("reference.tradein_only")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="p-3 font-semibold">{t("reference.brand")}</th>
                <th className="p-3 font-semibold">{t("reference.model")}</th>
                <th className="p-3 font-semibold">{t("reference.released")}</th>
                <th className="p-3 font-semibold">{t(tab === "watch" ? "reference.sizes" : "reference.storage")}</th>
                <th className="p-3 font-semibold text-right">{t("reference.tradein_from")}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {others.map(([key, m]) => {
                const [brand, model] = key.split("::");
                const prices = m.variants.map((v) => latest(v)?.price).filter((p): p is number => p !== undefined);
                return (
                  <tr key={key} className="border-t border-line">
                    <td className="p-3 text-muted font-medium">{brand}</td>
                    <td className="p-3 font-semibold">{model}</td>
                    <td className="p-3 text-muted tabular-nums">{m.launch.slice(0, 4)}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">{variantValues(m).map((x) => <Chip key={x}>{x}</Chip>)}</div></td>
                    <td className="p-3 text-right tabular-nums">{prices.length ? money(Math.min(...prices)) : "—"}</td>
                    <td className="p-3 text-right">
                      <Link to={`/historique?m=${encodeURIComponent(key)}`} aria-label={`${t("history.view")} : ${brand} ${model}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                        <LineChart className="w-3.5 h-3.5" /> {t("history.view")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : tab === "laptop" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {list.map((r) => (
            <Card key={r.id} className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted font-semibold uppercase tracking-wider">{r.brand} · {r.family} · {r.year}</div>
                  <div className="text-lg font-bold">{r.model}</div>
                  <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${r.verified === "platform" ? "bg-sand/20 text-warn" : "bg-lime/25 text-sell"}`}>
                    {t(`reference.verified_${r.verified ?? "platform"}`)}
                  </span>
                </div>
                {r.source && (
                  <a href={r.source} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline whitespace-nowrap">
                    {t("reference.spec")} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {([["CPU", r.cpu], ["RAM", r.ram], [t("reference.storage"), r.storage], [t("reference.display"), r.display]] as const).map(([label, xs]) => (
                <div key={label} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted font-medium">{label}</span>
                  <div className="flex flex-wrap gap-1.5">{(xs || []).map((x) => <Chip key={x}>{x}</Chip>)}</div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-2 sm:p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="p-3 font-semibold">{t("reference.brand")}</th>
                <th className="p-3 font-semibold">{t("reference.model")}</th>
                <th className="p-3 font-semibold text-right">{t("reference.base_price")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3 text-muted font-medium">{r.brand}</td>
                  <td className="p-3 font-semibold">{r.model}</td>
                  <td className="p-3 text-right tabular-nums">{eur(r.basePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {list.length === 0 && others.length === 0 && (tab === "laptop" || tab === "phone" || tradeIn) && <p className="text-center text-muted font-medium">{t("reference.none")}</p>}
    </div>
  );
}
