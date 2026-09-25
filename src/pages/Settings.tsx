import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/lib/pricing";
import type { Category, Grade } from "@/types";
import { GRADES } from "@/types";

const num = (v: string) => (v === "" || isNaN(Number(v)) ? 0 : Number(v));

export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, setSettings } = useStore();

  const setRefurb = (c: Category, g: Grade, v: string) =>
    setSettings({ ...settings, refurbCost: { ...settings.refurbCost, [c]: { ...settings.refurbCost[c], [g]: num(v) } } });

  return (
    <div className="flex flex-col gap-10 max-w-5xl mx-auto pb-12">
      <PageHeader
        title={t("settings.title")}
        desc={t("settings.desc")}
        actions={<Button variant="soft" onClick={() => setSettings(DEFAULT_SETTINGS)}><RotateCcw className="w-4 h-4" /> {t("settings.reset")}</Button>}
      />

      <Card className="p-8 flex flex-col gap-6">
        <h2 className="text-xl font-bold">{t("settings.formula")}</h2>
        <p className="text-sm text-muted font-medium font-mono bg-whisper/40 dark:bg-hunter/30 rounded-2xl p-4">{t("settings.formula_text")}</p>
        <div className="grid sm:grid-cols-2 gap-6">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("settings.margin")}
            <Input type="number" min={0} max={90} value={settings.targetMarginPct} onChange={(e) => setSettings({ ...settings, targetMarginPct: num(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("settings.concurrency")}
            <Input type="number" min={1} max={10} value={settings.agentConcurrency} onChange={(e) => setSettings({ ...settings, agentConcurrency: Math.max(1, num(e.target.value)) })} />
          </label>
        </div>
      </Card>

      <Card className="p-8 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">{t("settings.refurb")}</h2>
          <p className="text-sm text-muted font-medium mt-1">{t("settings.refurb_desc")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="p-2 font-semibold" />
                {GRADES.map((g) => <th key={g} className="p-2 font-semibold text-center">Grade {g}</th>)}
              </tr>
            </thead>
            <tbody>
              {(["laptop", "phone"] as Category[]).map((c) => (
                <tr key={c}>
                  <td className="p-2 font-semibold whitespace-nowrap">{t(`reference.${c}`)}</td>
                  {GRADES.map((g) => (
                    <td key={g} className="p-2">
                      <Input type="number" min={0} aria-label={`${c} ${g}`} value={settings.refurbCost[c][g]} onChange={(e) => setRefurb(c, g, e.target.value)} className="w-full text-center" />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-2 font-semibold whitespace-nowrap">{t("settings.grade_coef")}</td>
                {GRADES.map((g) => (
                  <td key={g} className="p-2">
                    <Input type="number" step={0.05} min={0} max={1} aria-label={`coef ${g}`} value={settings.gradeCoef[g]}
                      onChange={(e) => setSettings({ ...settings, gradeCoef: { ...settings.gradeCoef, [g]: num(e.target.value) } })} className="w-full text-center" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">{t("settings.grade_coef_desc")}</p>
      </Card>

      <Card className="p-8 flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t("settings.agents")}</h2>
        <p className="text-sm text-muted font-medium">{t("settings.agents_desc")}</p>
        <div className="font-mono text-xs bg-whisper/40 dark:bg-hunter/30 rounded-2xl p-4 break-all">{import.meta.env.VITE_API_URL || "http://localhost:3001"}</div>
      </Card>
    </div>
  );
}
