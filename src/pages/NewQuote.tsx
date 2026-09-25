import { useTranslation } from "react-i18next";
import { Card, PageHeader } from "@/components/ui";
import Stepper from "@/components/quote/Stepper";
import ImportStep from "@/components/quote/ImportStep";
import MappingStep from "@/components/quote/MappingStep";
import MatchStep from "@/components/quote/MatchStep";
import PricingStep from "@/components/quote/PricingStep";
import { useStore } from "@/lib/store";

export default function NewQuote() {
  const { t } = useTranslation();
  const { draft, setDraft } = useStore();
  const maxReached = draft.lines.length ? (draft.lines.some((l) => l.priceState !== "idle") ? 3 : 2) : draft.table ? 1 : 0;

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto pb-12">
      <PageHeader
        title={draft.client ? `${t("quote.title")} · ${draft.client}` : t("quote.title")}
        desc={t("quote.desc")}
      />
      <Stepper step={draft.step} maxReached={Math.max(maxReached, draft.step)} onGo={(s) => setDraft((d) => (s === 1 && !d.table ? d : { ...d, step: s }))} />
      <Card className="p-6 md:p-10 min-h-100">
        {draft.step === 0 && <ImportStep />}
        {draft.step === 1 && <MappingStep />}
        {draft.step === 2 && <MatchStep />}
        {draft.step === 3 && <PricingStep />}
      </Card>
    </div>
  );
}
