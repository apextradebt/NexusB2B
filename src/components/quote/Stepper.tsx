import { Upload, Columns3, ScanSearch, BadgeEuro } from "lucide-react";
import { useTranslation } from "react-i18next";

const STEPS = [
  { key: "steps.import", icon: Upload },
  { key: "steps.columns", icon: Columns3 },
  { key: "steps.matching", icon: ScanSearch },
  { key: "steps.pricing", icon: BadgeEuro },
];

export default function Stepper({ step, maxReached, onGo }: { step: number; maxReached: number; onGo: (s: number) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="flex items-center justify-between relative px-2 sm:px-8">
      <div className="absolute left-8 right-8 top-5 sm:top-6 h-1 bg-line -z-0 rounded-full" aria-hidden />
      {STEPS.map((s, i) => {
        const done = i <= step;
        const reachable = i <= maxReached;
        return (
          <li key={s.key} className="relative z-10 flex flex-col items-center gap-2 bg-bg px-2 sm:px-4">
            <button
              onClick={() => reachable && onGo(i)}
              disabled={!reachable}
              aria-current={i === step ? "step" : undefined}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${done ? "bg-primary text-on-primary shadow-soft-sm" : "bg-surface text-muted shadow-inner-soft"} ${reachable ? "cursor-pointer" : "cursor-default"}`}
            >
              <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <span className={`text-[11px] sm:text-xs font-semibold hidden sm:block ${done ? "text-ink" : "text-muted"}`}>{t(s.key)}</span>
          </li>
        );
      })}
    </ol>
  );
}
