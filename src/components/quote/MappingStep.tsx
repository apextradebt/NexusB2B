import { ArrowRight, Grid3x3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Select } from "@/components/ui";
import { buildLines } from "@/lib/parse";
import { matchLine } from "@/lib/match";
import { groupLines } from "@/lib/group";
import { useStore } from "@/lib/store";
import type { Field, Grade } from "@/types";
import { GRADES } from "@/types";

const FIELDS: Field[] = ["model", "description", "brand", "cpu", "ram", "storage", "grade", "quantity", "serial", "price", "ignore"];

export default function MappingStep() {
  const { t } = useTranslation();
  const { draft, setDraft, settings, setSettings } = useStore();
  const { table, layout } = draft;
  if (!table || !layout) return null;

  const pivot = Object.keys(layout.gradeColumns).length > 0;
  const hasModel = Object.values(layout.mapping).some((f) => f === "model" || f === "description");

  const setField = (header: string, field: Field) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout!, mapping: { ...d.layout!.mapping, [header]: field } } }));

  const analyse = () => {
    const raw = buildLines(table, layout);
    const lines = groupLines(raw, raw.map(matchLine), settings.defaultGrade);
    setDraft((d) => ({ ...d, step: 2, lines }));
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{draft.fileName}</span>
        <span className="text-muted">· {t("mapping.rows", { count: table.rows.length })}</span>
        {pivot && (
          <span className="inline-flex items-center gap-1.5 bg-lime/25 text-sell text-xs font-bold px-3 py-1 rounded-full">
            <Grid3x3 className="w-3.5 h-3.5" /> {t("mapping.pivot", { grades: Object.values(layout.gradeColumns).join(", ") })}
          </span>
        )}
      </div>

      <div className="overflow-x-auto -mx-2 px-2 pb-2">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th key={h} className="text-left align-top p-2 min-w-40">
                  <div className="font-semibold mb-2 truncate" title={h}>{h}</div>
                  {layout.gradeColumns[h] ? (
                    <div className="text-xs font-bold text-sell bg-lime/20 rounded-xl px-3 py-2">{t("mapping.grade_col", { grade: layout.gradeColumns[h] })}</div>
                  ) : (
                    <Select
                      ariaLabel={h}
                      value={layout.mapping[h]}
                      onChange={(v) => setField(h, v as Field)}
                      options={FIELDS.map((f) => ({ value: f, label: t(`fields.${f}`) }))}
                      className={`w-full ${layout.mapping[h] === "ignore" ? "text-muted" : ""}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 6).map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={`p-2 border-t border-line font-mono text-xs truncate max-w-56 ${layout.mapping[table.headers[j]] === "ignore" && !layout.gradeColumns[table.headers[j]] ? "text-muted/60" : ""}`} title={c}>
                    {c || <span className="text-muted/40">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-line">
        <label className="flex items-center gap-3 text-sm font-semibold">
          {t("mapping.default_grade")}
          <Select
            value={settings.defaultGrade}
            onChange={(v) => setSettings({ ...settings, defaultGrade: v as Grade })}
            options={GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))}
          />
        </label>
        <Button onClick={analyse} disabled={!hasModel}>
          {t("mapping.analyse")} <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
      {!hasModel && <p className="text-sm text-warn font-semibold -mt-4">{t("mapping.need_model")}</p>}
    </div>
  );
}
