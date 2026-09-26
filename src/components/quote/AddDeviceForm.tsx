import { useMemo, useState } from "react";
import { Check, Laptop, Plus, Smartphone, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "@/components/ui";
import { CATALOG, getRef, phoneStorage } from "@/lib/catalog";
import { manualLine, mergeDuplicates } from "@/lib/group";
import { eur } from "@/lib/pricing";
import { findListPrice, newEntryId } from "@/lib/priceList";
import { parsePrice } from "@/lib/parse";
import { useStore } from "@/lib/store";
import type { Category, Grade } from "@/types";
import { GRADES } from "@/types";

/**
 * Pick one device: type → brand → model → configuration → grade, then either add it to the quote
 * with a quantity, or (mode "price") record the customer's selling price for it.
 * Each dropdown only offers what the previous choice allows (factory options from the reference).
 * Selections stay after "Add" so several configurations of the same model can be entered quickly.
 */
export default function AddDeviceForm({ onAdded, mode = "quote" }: { onAdded?: () => void; mode?: "quote" | "price" }) {
  const { t } = useTranslation();
  const { setDraft, settings, priceList, addPrices } = useStore();
  const [category, setCategory] = useState<Category>("laptop");
  const [brand, setBrand] = useState("");
  const [modelId, setModelId] = useState("");
  const [cpu, setCpu] = useState("");
  const [ram, setRam] = useState("");
  const [storage, setStorage] = useState("");
  const [grade, setGrade] = useState<Grade | "">(mode === "price" ? "" : settings.defaultGrade);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [flash, setFlash] = useState(false);

  const brands = useMemo(() => [...new Set(CATALOG.filter((r) => r.category === category).map((r) => r.brand))], [category]);
  const models = useMemo(() => CATALOG.filter((r) => r.category === category && r.brand === brand), [category, brand]);
  const ref = getRef(modelId);
  const ramOptions = cpu.startsWith("Ryzen") && ref?.ramAmd ? ref.ramAmd : ref?.ram;
  const variant = { cpu: cpu || undefined, ram: ram || undefined, storage: storage || undefined };
  const priceValue = parsePrice(price)?.value;

  // In a quote, show what the customer sells this device for (if the price list knows it).
  const known = mode === "quote" && ref && grade ? findListPrice({ refId: ref.id, variant, grade }, priceList, settings.gradeCoef) : undefined;

  const resetConfig = () => { setCpu(""); setRam(""); setStorage(""); };
  const choose = (label: string) => [{ value: "", label }];

  const done = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    onAdded?.();
  };

  const add = () => {
    if (!ref) return;
    if (mode === "price") {
      if (priceValue === undefined) return;
      addPrices([{
        id: newEntryId(), refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model,
        variant: ref.category === "phone" ? { storage: variant.storage } : variant,
        grade: grade || undefined, price: Math.round(priceValue), updatedAt: new Date().toISOString(), source: "manual",
      }]);
      setPrice("");
      return done();
    }
    const line = manualLine(ref, variant, (grade || settings.defaultGrade) as Grade, Number(qty) || 1);
    setDraft((d) => ({ ...d, lines: mergeDuplicates([...d.lines, line]) }));
    setQty("1");
    done();
  };

  const field = "flex flex-col gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider";
  const gradeOptions = mode === "price"
    ? [{ value: "", label: t("prices.any_grade") }, ...GRADES.map((g) => ({ value: g, label: g }))]
    : GRADES.map((g) => ({ value: g, label: g }));

  return (
    <div className="rounded-[1.5rem] shadow-inner-soft p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold">{mode === "price" ? t("prices.add_title") : t("add.title")}</h3>
        <div role="radiogroup" className="flex gap-2">
          {([["laptop", Laptop], ["phone", Smartphone]] as const).map(([c, Icon]) => (
            <button
              key={c}
              role="radio"
              aria-checked={category === c}
              onClick={() => { setCategory(c); setBrand(""); setModelId(""); resetConfig(); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${category === c ? "bg-surface shadow-soft-sm text-primary" : "text-muted hover:text-ink"}`}
            >
              <Icon className="w-4 h-4" /> {t(`reference.${c}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <label className={field}>
          {t("fields.brand")}
          <Select ariaLabel={t("fields.brand")} value={brand} onChange={(v) => { setBrand(v); setModelId(""); resetConfig(); }}
            options={[...choose(t("add.choose")), ...brands.map((b) => ({ value: b, label: b }))]} />
        </label>
        <label className={`${field} lg:col-span-3`}>
          {t("fields.model")}
          <Select ariaLabel={t("fields.model")} value={modelId} onChange={(v) => { setModelId(v); resetConfig(); }}
            options={[...choose(brand ? t("add.choose") : t("add.brand_first")), ...models.map((m) => ({ value: m.id, label: m.model }))]} />
        </label>

        {category === "laptop" ? (
          <>
            <label className={field}>
              {t("fields.cpu")}
              <Select ariaLabel={t("fields.cpu")} value={cpu} onChange={(v) => { setCpu(v); if (ram && !(v.startsWith("Ryzen") && ref?.ramAmd ? ref.ramAmd : ref?.ram)?.includes(ram)) setRam(""); }}
                options={[...choose(mode === "price" ? t("prices.any") : "—"), ...(ref?.cpu || []).map((x) => ({ value: x, label: x }))]} />
            </label>
            <label className={field}>
              {t("fields.ram")}
              <Select ariaLabel={t("fields.ram")} value={ram} onChange={setRam} options={[...choose(mode === "price" ? t("prices.any") : "—"), ...(ramOptions || []).map((x) => ({ value: x, label: x }))]} />
            </label>
            <label className={field}>
              {t("fields.storage")}
              <Select ariaLabel={t("fields.storage")} value={storage} onChange={setStorage} options={[...choose(mode === "price" ? t("prices.any") : "—"), ...(ref?.storage || []).map((x) => ({ value: x, label: x }))]} />
            </label>
          </>
        ) : (
          <label className={`${field} sm:col-span-2 lg:col-span-3`}>
            {t("add.capacity")}
            <Select ariaLabel={t("add.capacity")} value={storage} onChange={setStorage} options={[...choose(mode === "price" ? t("prices.any") : "—"), ...phoneStorage(ref).map((x) => ({ value: x, label: x }))]} />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            {t("fields.grade")}
            <Select ariaLabel={t("fields.grade")} value={grade} onChange={(v) => setGrade(v as Grade | "")} options={gradeOptions} />
          </label>
          {mode === "price" ? (
            <label className={field}>
              {t("prices.price")}
              <Input aria-label={t("prices.price")} inputMode="decimal" placeholder="€" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,\s€]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} className="w-full" />
            </label>
          ) : (
            <label className={field}>
              {t("fields.quantity")}
              <Input aria-label={t("fields.quantity")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} className="w-full" />
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {known && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold text-sell bg-lime/20 rounded-full px-3 py-1">
            <Tag className="w-3.5 h-3.5" /> {t("prices.your_price")} : {eur(known.price)}{known.note ? ` (${known.note})` : ""}
          </span>
        )}
        {mode === "quote" && ref && category === "laptop" && (!cpu || !ram || !storage) && <span className="text-xs text-warn font-medium">{t("add.incomplete")}</span>}
        {mode === "price" && ref && category === "laptop" && (!cpu || !ram || !storage) && <span className="text-xs text-muted font-medium">{t("prices.partial_hint")}</span>}
        <Button onClick={add} disabled={!ref || (mode === "price" && priceValue === undefined)}>
          {flash ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {flash ? t("add.added") : mode === "price" ? t("prices.add_submit") : t("add.submit")}
        </Button>
      </div>
    </div>
  );
}
