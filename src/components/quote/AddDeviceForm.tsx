import { useMemo, useState } from "react";
import { Check, Laptop, Plus, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "@/components/ui";
import { CATALOG, getRef, phoneStorage } from "@/lib/catalog";
import { manualLine, mergeDuplicates } from "@/lib/group";
import { useStore } from "@/lib/store";
import type { Category, Grade } from "@/types";
import { GRADES } from "@/types";

/**
 * Add one device by hand: type → brand → model → configuration → grade → quantity.
 * Each dropdown only offers what the previous choice allows (factory options from the reference).
 * Selections stay after "Add" so several configurations of the same model can be entered quickly.
 */
export default function AddDeviceForm({ onAdded }: { onAdded?: () => void }) {
  const { t } = useTranslation();
  const { setDraft, settings } = useStore();
  const [category, setCategory] = useState<Category>("laptop");
  const [brand, setBrand] = useState("");
  const [modelId, setModelId] = useState("");
  const [cpu, setCpu] = useState("");
  const [ram, setRam] = useState("");
  const [storage, setStorage] = useState("");
  const [grade, setGrade] = useState<Grade>(settings.defaultGrade);
  const [qty, setQty] = useState("1");
  const [flash, setFlash] = useState(false);

  const brands = useMemo(() => [...new Set(CATALOG.filter((r) => r.category === category).map((r) => r.brand))], [category]);
  const models = useMemo(() => CATALOG.filter((r) => r.category === category && r.brand === brand), [category, brand]);
  const ref = getRef(modelId);
  const ramOptions = cpu.startsWith("Ryzen") && ref?.ramAmd ? ref.ramAmd : ref?.ram;

  const resetConfig = () => { setCpu(""); setRam(""); setStorage(""); };
  const choose = (label: string) => [{ value: "", label }];

  const add = () => {
    if (!ref) return;
    const line = manualLine(ref, { cpu: cpu || undefined, ram: ram || undefined, storage: storage || undefined }, grade, Number(qty) || 1);
    setDraft((d) => ({ ...d, lines: mergeDuplicates([...d.lines, line]) }));
    setQty("1");
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    onAdded?.();
  };

  const field = "flex flex-col gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider";

  return (
    <div className="rounded-[1.5rem] shadow-inner-soft p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold">{t("add.title")}</h3>
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
                options={[...choose("—"), ...(ref?.cpu || []).map((x) => ({ value: x, label: x }))]} />
            </label>
            <label className={field}>
              {t("fields.ram")}
              <Select ariaLabel={t("fields.ram")} value={ram} onChange={setRam} options={[...choose("—"), ...(ramOptions || []).map((x) => ({ value: x, label: x }))]} />
            </label>
            <label className={field}>
              {t("fields.storage")}
              <Select ariaLabel={t("fields.storage")} value={storage} onChange={setStorage} options={[...choose("—"), ...(ref?.storage || []).map((x) => ({ value: x, label: x }))]} />
            </label>
          </>
        ) : (
          <label className={`${field} sm:col-span-2 lg:col-span-3`}>
            {t("add.capacity")}
            <Select ariaLabel={t("add.capacity")} value={storage} onChange={setStorage} options={[...choose("—"), ...phoneStorage(ref).map((x) => ({ value: x, label: x }))]} />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            {t("fields.grade")}
            <Select ariaLabel={t("fields.grade")} value={grade} onChange={(v) => setGrade(v as Grade)} options={GRADES.map((g) => ({ value: g, label: g }))} />
          </label>
          <label className={field}>
            {t("fields.quantity")}
            <Input aria-label={t("fields.quantity")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} className="w-full" />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {ref && category === "laptop" && (!cpu || !ram || !storage) && <span className="text-xs text-warn font-medium">{t("add.incomplete")}</span>}
        <Button onClick={add} disabled={!ref}>
          {flash ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {flash ? t("add.added") : t("add.submit")}
        </Button>
      </div>
    </div>
  );
}
