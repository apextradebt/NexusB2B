import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, Download, ClipboardPaste, Loader2, Sparkles, ListPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@/components/ui";
import { detectLayout, parseText, readFile, type Table } from "@/lib/parse";
import { downloadTemplate } from "@/lib/export";
import { sampleLot } from "@/lib/sample";
import { useStore } from "@/lib/store";

export default function ImportStep() {
  const { t } = useTranslation();
  const { draft, setDraft } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (table: Table, fileName: string) => {
    if (table.rows.length === 0) {
      setError(t("import.empty"));
      return;
    }
    setDraft((d) => ({ ...d, step: 1, fileName, table, layout: detectLayout(table), lines: [], savedId: undefined }));
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      accept(await readFile(file), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("import.client")}
          <Input value={draft.client} onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))} placeholder="ACME SAS" />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("import.reference")}
          <Input value={draft.reference} onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))} placeholder="Lot 2026-09 / appel d'offres…" />
        </label>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
        className={`rounded-[2rem] border-2 border-dashed p-10 sm:p-14 flex flex-col items-center gap-5 text-center transition-colors ${dragging ? "border-primary bg-lime/10" : "border-line"}`}
      >
        <div className="w-16 h-16 rounded-full bg-surface shadow-soft flex items-center justify-center text-primary">
          {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : <FileSpreadsheet className="w-7 h-7" />}
        </div>
        <div>
          <p className="text-lg font-bold">{t("import.drop_title")}</p>
          <p className="text-sm text-muted font-medium mt-1">{t("import.drop_desc")}</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="w-4 h-4" /> {t("import.choose")}
          </Button>
          <Button variant="soft" onClick={() => setDraft((d) => ({ ...d, step: 2, fileName: t("import.manual_name"), table: undefined, layout: undefined }))}>
            <ListPlus className="w-4 h-4" /> {t("import.manual")}
          </Button>
          <Button variant="soft" onClick={() => setShowPaste((s) => !s)}>
            <ClipboardPaste className="w-4 h-4" /> {t("import.paste")}
          </Button>
        </div>
      </div>

      {showPaste && (
        <div className="flex flex-col gap-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            placeholder={t("import.paste_placeholder")}
            className="bg-surface shadow-inner-soft rounded-2xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button className="self-end" disabled={!paste.trim()} onClick={() => accept(parseText(paste), t("import.pasted"))}>
            {t("import.analyse_paste")}
          </Button>
        </div>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-warn">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
        <p className="text-xs text-muted font-medium max-w-xl pt-4">{t("import.formats")}</p>
        <div className="flex gap-2 pt-4">
          <Button variant="ghost" onClick={downloadTemplate}><Download className="w-4 h-4" /> {t("import.template")}</Button>
          <Button variant="ghost" onClick={() => accept(parseText(sampleLot()), "exemple.csv")}><Sparkles className="w-4 h-4" /> {t("import.sample")}</Button>
        </div>
      </div>
    </div>
  );
}
