import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { eur, marketVerdict } from "@/lib/pricing";

const ICONS = { high: ArrowUp, low: ArrowDown, ok: Check };

/** Says whether one of our prices is too high, too low or in line with what the agents found. */
export default function MarketSignal({ gap, market, kind }: { gap?: number; market?: number; kind: "sell" | "buy" }) {
  const { t } = useTranslation();
  if (gap === undefined) return null;
  const verdict = marketVerdict(gap);
  const pct = Math.round(gap * 100);
  const Icon = ICONS[verdict];
  return (
    <span
      title={t(`pricing.signal_${kind}_${verdict}`, { market: eur(market) })}
      className={`inline-flex items-center gap-0.5 text-[10px] whitespace-nowrap tabular-nums ${verdict === "ok" ? "font-medium text-muted" : "font-bold text-warn"}`}
    >
      <Icon className="w-3 h-3" /> {t(`pricing.verdict_${verdict}`)} · {pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct)} %
    </span>
  );
}
