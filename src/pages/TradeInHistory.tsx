import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { Card, Chip, Input, PageHeader, Stat } from "@/components/ui";
import TradeInChart from "@/components/TradeInChart";
import { normalize } from "@/lib/match";
import { change, money, latest, monthLabel, useTradeIn, variantLabel } from "@/lib/tradein";

const pct = (x?: number) => (x === undefined ? "—" : `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`);

/** Price evolution of every device in the trade-in history: pick a model, read the curve per capacity. */
export default function TradeInHistory() {
  const { t } = useTranslation();
  const data = useTradeIn();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const selected = params.get("m") ?? "";

  // Newest first within each brand, brands alphabetically.
  const keys = useMemo(
    () => (data ? Object.keys(data.models).sort((a, b) => a.split("::")[0].localeCompare(b.split("::")[0]) || data.models[b].launch.localeCompare(data.models[a].launch) || a.localeCompare(b)) : []),
    [data],
  );
  const list = useMemo(() => {
    const nq = normalize(q);
    return nq ? keys.filter((k) => normalize(k.replace("::", " ")).includes(nq)) : keys;
  }, [keys, q]);

  const model = data?.models[selected];
  const [brand, name] = selected.split("::");
  const base = model?.variants.find((v) => latest(v)) ;
  const baseLatest = base && latest(base);

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-12">
      <PageHeader
        title={t("history.title")}
        desc={data ? t("history.desc", { count: keys.length, date: data.generatedAt }) : t("history.loading")}
      />

      {!data ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> {t("history.loading")}</p>
      ) : (
        <div className="grid lg:grid-cols-[18rem_1fr] gap-6 items-start">
          <Card className="p-4 flex flex-col gap-3 lg:sticky lg:top-6">
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("history.search")} aria-label={t("history.search")} className="w-full pl-9 rounded-full" />
            </div>
            <ul className="flex flex-col max-h-[60vh] overflow-y-auto -mx-1 px-1" aria-label={t("history.models")}>
              {list.map((k, i) => {
                const [b, m] = k.split("::");
                const newBrand = i === 0 || list[i - 1].split("::")[0] !== b;
                return (
                  <li key={k}>
                    {newBrand && <div className="text-[11px] font-semibold uppercase tracking-wider text-muted px-2 pt-3 pb-1">{b}</div>}
                    <button
                      onClick={() => setParams({ m: k })}
                      aria-current={k === selected}
                      className={`w-full flex items-center justify-between gap-2 text-left text-sm px-2 py-1.5 rounded-lg ${k === selected ? "bg-lime/20 font-semibold text-ink" : "hover:bg-line/40"}`}
                    >
                      <span className="truncate">{m}</span>
                      <span className="text-[11px] text-muted tabular-nums shrink-0">{data.models[k].launch.slice(0, 4)}</span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="text-sm text-muted px-2 py-3">{t("history.none")}</li>}
            </ul>
          </Card>

          {!model ? (
            <Card className="p-10 text-center text-muted text-sm">{t("history.pick")}</Card>
          ) : (
            <div className="flex flex-col gap-6 min-w-0">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-2xl font-bold">{brand} {name}</h2>
                <Chip>{t("history.launched", { date: monthLabel(model.launch, "long") })}</Chip>
                {model.launchPriceExVat && <Chip>{t("history.launch_price", { price: money(model.launchPriceExVat) })}</Chip>}
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Stat label={t("history.latest", { variant: base ? variantLabel(base) : "" })} value={money(baseLatest?.price)} hint={baseLatest && monthLabel(baseLatest.month, "long")} />
                <Stat label={t("history.change", { months: 3 })} value={pct(base && change(base, 3))} />
                <Stat label={t("history.change", { months: 12 })} value={pct(base && change(base, 12))} />
                <Stat label={t("history.vs_launch")} value={pct(baseLatest && model.launchPriceExVat ? baseLatest.price / model.launchPriceExVat - 1 : undefined)} hint={t("history.vs_launch_hint")} />
              </div>

              <Card className="p-6 flex flex-col gap-2">
                <h3 className="font-bold">{t("history.chart_title")}</h3>
                <p className="text-xs text-muted">{t("history.chart_hint")}</p>
                <TradeInChart model={model} />
              </Card>

              <Card className="p-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="text-left font-bold mb-3">{t("history.table_title")}</caption>
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="p-2 font-semibold">{t("add.capacity")}</th>
                      <th className="p-2 font-semibold text-right">{t("history.col_latest")}</th>
                      <th className="p-2 font-semibold">{t("history.col_month")}</th>
                      <th className="p-2 font-semibold text-right">{t("history.change", { months: 3 })}</th>
                      <th className="p-2 font-semibold text-right">{t("history.change", { months: 12 })}</th>
                      <th className="p-2 font-semibold">{t("history.col_since")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.variants.map((v) => {
                      const l = latest(v);
                      return (
                        <tr key={variantLabel(v)} className="border-t border-line">
                          <td className="p-2 font-semibold">{variantLabel(v)}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{money(l?.price)}</td>
                          <td className="p-2 text-muted">{l && monthLabel(l.month)}</td>
                          <td className="p-2 text-right tabular-nums">{pct(change(v, 3))}</td>
                          <td className="p-2 text-right tabular-nums">{pct(change(v, 12))}</td>
                          <td className="p-2 text-muted">{monthLabel(v.start)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
