import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileDown, Laptop, Plus, Search, Smartphone, Tag, Trash2, Upload } from "lucide-react";
import { Button, Card, Chip, Input, PageHeader, Select } from "@/components/ui";
import AddDeviceForm from "@/components/quote/AddDeviceForm";
import PriceImport from "@/components/prices/PriceImport";
import { exportPriceList, downloadPriceTemplate } from "@/lib/export";
import { normalize } from "@/lib/match";
import { eur } from "@/lib/pricing";
import { parsePrice } from "@/lib/parse";
import { useStore } from "@/lib/store";
import type { Category, Grade, PriceListEntry } from "@/types";
import { GRADES } from "@/types";

const GRADE_ORDER = "ABCDE";

/**
 * The customer's own selling prices, by model, configuration and grade. Used on every quote as
 * the resale reference, so buy offers keep the target margin on what the customer actually sells at.
 */
export default function PriceList() {
  const { t } = useTranslation();
  const { priceList, updatePrice, deletePrice, clearPrices } = useStore();
  const [panel, setPanel] = useState<"none" | "add" | "import">(priceList.length ? "none" : "import");
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");

  const counts = { laptop: priceList.filter((e) => e.category === "laptop").length, phone: priceList.filter((e) => e.category === "phone").length };
  const shown = useMemo(() => {
    const nq = normalize(q);
    return priceList
      .filter((e) => cat === "all" || e.category === cat)
      .filter((e) => !nq || normalize(`${e.brand} ${e.model} ${e.variant.cpu ?? ""} ${e.variant.ram ?? ""} ${e.variant.storage ?? ""}`).includes(nq))
      .sort((a, b) =>
        a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model, undefined, { numeric: true }) ||
        [a.variant.cpu, a.variant.ram, a.variant.storage].join("|").localeCompare([b.variant.cpu, b.variant.ram, b.variant.storage].join("|"), undefined, { numeric: true }) ||
        GRADE_ORDER.indexOf(a.grade ?? "Z") - GRADE_ORDER.indexOf(b.grade ?? "Z"));
  }, [priceList, q, cat]);

  const notify = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-12">
      <PageHeader
        title={t("prices.title")}
        desc={t("prices.desc")}
        actions={
          <>
            <Button variant={panel === "import" ? "primary" : "soft"} onClick={() => setPanel(panel === "import" ? "none" : "import")}><Upload className="w-4 h-4" /> {t("prices.import")}</Button>
            <Button variant={panel === "add" ? "primary" : "soft"} onClick={() => setPanel(panel === "add" ? "none" : "add")}><Plus className="w-4 h-4" /> {t("prices.add")}</Button>
          </>
        }
      />

      {flash && <p role="status" className="text-sm font-semibold text-sell bg-lime/20 rounded-2xl px-5 py-3">{flash}</p>}

      {panel === "import" && (
        <Card className="p-6 sm:p-8">
          <PriceImport onDone={(n) => { setPanel("none"); notify(t("prices.imported", { count: n })); }} />
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={downloadPriceTemplate}><FileDown className="w-4 h-4" /> {t("prices.template")}</Button>
          </div>
        </Card>
      )}
      {panel === "add" && <AddDeviceForm mode="price" />}

      {priceList.length === 0 ? (
        panel === "none" && (
          <Card className="p-12 flex flex-col items-center gap-3 text-center">
            <Tag className="w-10 h-10 text-muted" />
            <p className="font-semibold">{t("prices.empty")}</p>
            <p className="text-sm text-muted max-w-md">{t("prices.empty_hint")}</p>
          </Card>
        )
      ) : (
        <Card className="p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div role="tablist" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {([["all", null, priceList.length], ["laptop", Laptop, counts.laptop], ["phone", Smartphone, counts.phone]] as const).map(([key, Icon, n]) => (
                <button key={key} role="tab" aria-selected={cat === key} onClick={() => setCat(key)}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${cat === key ? "shadow-soft-active text-primary" : "text-muted hover:text-ink"}`}>
                  {Icon && <Icon className="w-4 h-4" />} {key === "all" ? t("quotes.all") : t(`reference.${key}`)} <span className="opacity-70 tabular-nums">{n}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("reference.search")} className="w-full pl-10 rounded-full" />
            </div>
          </div>

          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="p-2 font-semibold min-w-56">{t("match.device")}</th>
                  <th className="p-2 font-semibold text-center">{t("match.grade")}</th>
                  <th className="p-2 font-semibold text-right">{t("prices.price")}</th>
                  <th className="p-2 font-semibold hidden md:table-cell">{t("prices.updated")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {/* Keyed on the price too: a re-import or a new entry for the same device resets the input. */}
                {shown.map((e) => <Row key={`${e.id}:${e.price}`} e={e} onChange={(p) => updatePrice(e.id, p)} onDelete={() => deletePrice(e.id)} />)}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-sm text-muted p-4">{t("reference.none")}</p>}
          </div>

          <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-line">
            <Button variant="ghost" onClick={() => { if (confirm(t("prices.confirm_clear", { count: priceList.length }))) clearPrices(); }}>
              <Trash2 className="w-4 h-4" /> {t("prices.clear")}
            </Button>
            <Button variant="soft" onClick={() => exportPriceList(shown)}><Download className="w-4 h-4" /> {t("prices.export")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ e, onChange, onDelete }: { e: PriceListEntry; onChange: (p: Partial<PriceListEntry>) => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(e.price));
  const commit = () => {
    const v = parsePrice(draft)?.value;
    if (v !== undefined && Math.round(v) !== e.price) onChange({ price: Math.round(v) });
    else setDraft(String(e.price));
  };
  return (
    <tr className="border-t border-line">
      <td className="p-2">
        <div className="font-semibold">{e.brand} {e.model}</div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {e.category === "laptop"
            ? [e.variant.cpu, e.variant.ram, e.variant.storage].map((v, i) => <Chip key={i} muted={!v}>{v || t("prices.any")}</Chip>)
            : <Chip muted={!e.variant.storage}>{e.variant.storage || t("prices.any")}</Chip>}
        </div>
      </td>
      <td className="p-2 text-center">
        <Select ariaLabel={t("fields.grade")} value={e.grade ?? ""} onChange={(v) => onChange({ grade: (v || undefined) as Grade | undefined })}
          options={[{ value: "", label: t("prices.any_grade") }, ...GRADES.map((g) => ({ value: g, label: g }))]} className="text-xs" />
      </td>
      <td className="p-2 text-right">
        <input
          aria-label={`${t("prices.price")} ${e.model}`}
          inputMode="decimal"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onBlur={commit}
          onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
          className="w-24 text-right bg-surface shadow-inner-soft rounded-xl px-3 py-1.5 font-bold tabular-nums text-sell focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <span className="sr-only">{eur(e.price)}</span>
      </td>
      <td className="p-2 text-xs text-muted hidden md:table-cell whitespace-nowrap">
        {new Date(e.updatedAt).toLocaleDateString("fr-FR")} · {t(`prices.source_${e.source}`)}
      </td>
      <td className="p-2 text-right">
        <button onClick={onDelete} aria-label={t("add.remove")} className="p-1.5 rounded-full text-muted hover:text-ink"><Trash2 className="w-4 h-4" /></button>
      </td>
    </tr>
  );
}
