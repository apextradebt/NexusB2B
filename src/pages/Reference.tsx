import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ExternalLink, Laptop, Smartphone } from "lucide-react";
import { Card, Chip, Input, PageHeader } from "@/components/ui";
import { LAPTOPS, PHONES } from "@/lib/catalog";
import { eur } from "@/lib/pricing";
import { normalize } from "@/lib/match";
import type { Category } from "@/types";

export default function Reference() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Category>("laptop");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
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
        {([["laptop", Laptop, LAPTOPS.length], ["phone", Smartphone, PHONES.length]] as const).map(([key, Icon, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${tab === key ? "shadow-soft-active text-primary" : "text-muted hover:text-ink"}`}>
            <Icon className="w-4 h-4" /> {t(`reference.${key}`)} <span className="opacity-70">({n})</span>
          </button>
        ))}
      </div>

      {tab === "laptop" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {list.map((r) => (
            <Card key={r.id} className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted font-semibold uppercase tracking-wider">{r.brand} · {r.family} · {r.year}</div>
                  <div className="text-lg font-bold">{r.model}</div>
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
      {list.length === 0 && <p className="text-center text-muted font-medium">{t("reference.none")}</p>}
    </div>
  );
}
