import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, FileDown, Laptop, List, Library, Pencil, Plus, Search, Smartphone, Tag, Trash2, Upload } from "lucide-react";
import { Button, Card, Chip, Input, PageHeader, Select } from "@/components/ui";
import AddDeviceForm from "@/components/quote/AddDeviceForm";
import PriceImport from "@/components/prices/PriceImport";
import ModelPriceEditor from "@/components/prices/ModelPriceEditor";
import { CATALOG } from "@/lib/catalog";
import { exportPriceList, downloadPriceTemplate } from "@/lib/export";
import { normalize } from "@/lib/match";
import { eur } from "@/lib/pricing";
import { parsePrice } from "@/lib/parse";
import { useStore } from "@/lib/store";
import type { Category, Grade, PriceListEntry } from "@/types";
import { GRADES } from "@/types";

const GRADE_ORDER = "ABCDE";
const PAGE = 60;

/**
 * The customer's own selling prices, by model, configuration and grade. Used on every quote as
 * the resale reference, so buy offers keep the target margin on what the customer actually sells at.
 * Two views: the prices already set, and the whole catalog to go through model by model.
 */
export default function PriceList() {
  const { t } = useTranslation();
  const { priceList, updatePrice, deletePrice, clearPrices } = useStore();
  const [view, setView] = useState<"mine" | "models">(priceList.length ? "mine" : "models");
  const [panel, setPanel] = useState<"none" | "add" | "import">("none");
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const notify = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  };
  const edit = (e: PriceListEntry) => {
    setView("models");
    setCat("all");
    setQ(`${e.brand} ${e.model}`);
    setOpenId(e.refId);
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
          <PriceImport onDone={(n) => { setPanel("none"); setView("mine"); notify(t("prices.imported", { count: n })); }} />
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={downloadPriceTemplate}><FileDown className="w-4 h-4" /> {t("prices.template")}</Button>
          </div>
        </Card>
      )}
      {panel === "add" && <AddDeviceForm mode="price" />}

      <Card className="p-6 sm:p-8 flex flex-col gap-5">
        <div role="tablist" aria-label={t("prices.views")} className="flex gap-2 border-b border-line -mx-2 px-2 pb-3 overflow-x-auto [scrollbar-width:none]">
          {([["mine", List, t("prices.view_mine"), priceList.length], ["models", Library, t("prices.view_models"), CATALOG.length]] as const).map(([key, Icon, label, n]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${view === key ? "bg-primary text-on-primary shadow-soft-sm" : "text-muted hover:text-ink"}`}>
              <Icon className="w-4 h-4" /> {label} <span className="opacity-70 tabular-nums">{n}</span>
            </button>
          ))}
        </div>

        <Filters q={q} setQ={setQ} cat={cat} setCat={setCat} counts={view === "mine"
          ? { all: priceList.length, laptop: priceList.filter((e) => e.category === "laptop").length, phone: priceList.filter((e) => e.category === "phone").length }
          : { all: CATALOG.length, laptop: CATALOG.filter((r) => r.category === "laptop").length, phone: CATALOG.filter((r) => r.category === "phone").length }} />

        {view === "mine" ? (
          <MinePrices q={q} cat={cat} onEdit={edit} onChange={updatePrice} onDelete={deletePrice} onClear={clearPrices} onBrowse={() => setView("models")} />
        ) : (
          <AllModels q={q} cat={cat} openId={openId} setOpenId={setOpenId} />
        )}
      </Card>
    </div>
  );
}

function Filters({ q, setQ, cat, setCat, counts }: {
  q: string; setQ: (v: string) => void; cat: Category | "all"; setCat: (c: Category | "all") => void; counts: Record<Category | "all", number>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
      <div role="tablist" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {([["all", null], ["laptop", Laptop], ["phone", Smartphone]] as const).map(([key, Icon]) => (
          <button key={key} role="tab" aria-selected={cat === key} onClick={() => setCat(key)}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${cat === key ? "shadow-soft-active text-primary" : "text-muted hover:text-ink"}`}>
            {Icon && <Icon className="w-4 h-4" />} {key === "all" ? t("quotes.all") : t(`reference.${key}`)} <span className="opacity-70 tabular-nums">{counts[key]}</span>
          </button>
        ))}
      </div>
      <div className="relative sm:w-72">
        <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("reference.search")} aria-label={t("reference.search")} className="w-full pl-10 rounded-full" />
      </div>
    </div>
  );
}

/** Every catalog model, collapsed; open one to set its prices configuration by configuration and grade by grade. */
function AllModels({ q, cat, openId, setOpenId }: { q: string; cat: Category | "all"; openId: string | null; setOpenId: (id: string | null) => void }) {
  const { t } = useTranslation();
  const { priceList } = useStore();
  const [only, setOnly] = useState<"all" | "priced" | "unpriced">("all");
  const [limit, setLimit] = useState(PAGE);
  const openRef = useRef<HTMLLIElement>(null);

  const byModel = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const e of priceList) m.set(e.refId, [...(m.get(e.refId) ?? []), e.price]);
    return m;
  }, [priceList]);

  const models = useMemo(() => {
    const nq = normalize(q);
    return CATALOG.filter((r) => (cat === "all" || r.category === cat)
      && (only === "all" || (only === "priced") === byModel.has(r.id))
      && (!nq || normalize(`${r.brand} ${r.model}`).includes(nq)));
  }, [q, cat, only, byModel]);

  useEffect(() => setLimit(PAGE), [q, cat, only]);
  useEffect(() => { if (openId) openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [openId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">{t("prices.models_count", { count: models.length })}</span>
        <Select ariaLabel={t("prices.filter_priced")} value={only} onChange={(v) => setOnly(v as typeof only)}
          options={[{ value: "all", label: t("prices.filter_all") }, { value: "priced", label: t("prices.filter_priced") }, { value: "unpriced", label: t("prices.filter_unpriced") }]} />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {models.slice(0, limit).map((r) => {
          const prices = byModel.get(r.id) ?? [];
          const open = openId === r.id;
          return (
            <li key={r.id} ref={open ? openRef : undefined}>
              <button onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}
                className="w-full flex items-center gap-3 py-3 px-2 text-left rounded-xl hover:bg-line/30">
                {r.category === "laptop" ? <Laptop className="w-4 h-4 text-muted shrink-0" /> : <Smartphone className="w-4 h-4 text-muted shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.brand} {r.model}</span>
                  {r.year && <span className="text-xs text-muted ml-2">{r.year}</span>}
                </span>
                {prices.length > 0 ? (
                  <span className="text-xs font-semibold text-sell bg-lime/20 rounded-full px-2.5 py-0.5 whitespace-nowrap tabular-nums">
                    {t("prices.n_prices", { count: prices.length })} · {prices.length > 1 ? `${eur(Math.min(...prices))} – ${eur(Math.max(...prices))}` : eur(prices[0])}
                  </span>
                ) : (
                  <span className="text-xs text-muted whitespace-nowrap">{t("prices.no_price_yet")}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && <div className="px-2 pb-5 pt-1"><ModelPriceEditor model={r} /></div>}
            </li>
          );
        })}
      </ul>
      {models.length > limit && (
        <Button variant="soft" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
          {t("prices.show_more", { count: Math.min(PAGE, models.length - limit), left: models.length - limit })}
        </Button>
      )}
      {models.length === 0 && <p className="text-sm text-muted p-4">{t("reference.none")}</p>}
    </div>
  );
}

function MinePrices({ q, cat, onEdit, onChange, onDelete, onClear, onBrowse }: {
  q: string; cat: Category | "all"; onEdit: (e: PriceListEntry) => void; onChange: (id: string, p: Partial<PriceListEntry>) => void;
  onDelete: (id: string) => void; onClear: () => void; onBrowse: () => void;
}) {
  const { t } = useTranslation();
  const { priceList } = useStore();
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

  if (priceList.length === 0) {
    return (
      <div className="p-10 flex flex-col items-center gap-3 text-center">
        <Tag className="w-10 h-10 text-muted" />
        <p className="font-semibold">{t("prices.empty")}</p>
        <p className="text-sm text-muted max-w-md">{t("prices.empty_hint")}</p>
        <Button variant="soft" onClick={onBrowse}><Library className="w-4 h-4" /> {t("prices.view_models")}</Button>
      </div>
    );
  }

  return (
    <>
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
            {shown.map((e) => <Row key={`${e.id}:${e.price}`} e={e} onChange={(p) => onChange(e.id, p)} onDelete={() => onDelete(e.id)} onEdit={() => onEdit(e)} />)}
          </tbody>
        </table>
        {shown.length === 0 && <p className="text-sm text-muted p-4">{t("reference.none")}</p>}
      </div>
      <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-line">
        <Button variant="ghost" onClick={() => { if (confirm(t("prices.confirm_clear", { count: priceList.length }))) onClear(); }}>
          <Trash2 className="w-4 h-4" /> {t("prices.clear")}
        </Button>
        <Button variant="soft" onClick={() => exportPriceList(shown)}><Download className="w-4 h-4" /> {t("prices.export")}</Button>
      </div>
    </>
  );
}

function Row({ e, onChange, onDelete, onEdit }: { e: PriceListEntry; onChange: (p: Partial<PriceListEntry>) => void; onDelete: () => void; onEdit: () => void }) {
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
      </td>
      <td className="p-2 text-xs text-muted hidden md:table-cell whitespace-nowrap">
        {new Date(e.updatedAt).toLocaleDateString("fr-FR")} · {t(`prices.source_${e.source}`)}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <button onClick={onEdit} aria-label={t("prices.edit_model")} title={t("prices.edit_model")} className="p-1.5 rounded-full text-muted hover:text-ink"><Pencil className="w-4 h-4" /></button>
        <button onClick={onDelete} aria-label={t("add.remove")} className="p-1.5 rounded-full text-muted hover:text-ink"><Trash2 className="w-4 h-4" /></button>
      </td>
    </tr>
  );
}
