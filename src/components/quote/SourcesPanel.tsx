import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { eur } from "@/lib/pricing";
import type { AgentResult, QuoteLine } from "@/types";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function SourceList({ title, hint, results, tone }: { title: string; hint: string; results: AgentResult[]; tone: "buy" | "sell" }) {
  const { t } = useTranslation();
  const rows = results
    .flatMap((r) => r.offers.map((o) => ({ r, o })))
    .sort((a, b) => (tone === "buy" ? b.o.price - a.o.price : a.o.price - b.o.price));
  return (
    <section className="flex flex-col gap-2 min-w-0">
      <header>
        <h4 className="font-bold text-sm">{title} <span className="text-muted font-medium">({rows.length})</span></h4>
        <p className="text-[11px] text-muted">{hint}</p>
      </header>
      {rows.length === 0 && <p className="text-xs text-muted py-2">{t("sources.none")}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {rows.map(({ r, o }, i) => {
          const links = o.links?.length ? o.links : o.url ? [o.url] : [];
          return (
            <li key={`${r.agent}-${i}`} className="py-2 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-sm truncate">{o.source}</span>
                <span className={`font-bold tabular-nums whitespace-nowrap ${tone === "buy" ? "text-buy" : "text-sell"}`}>{eur(o.price)}</span>
              </div>
              {(r.message || o.grade) && (
                <div className="text-[11px] text-muted">
                  {[o.grade && !/grade/i.test(r.message ?? "") ? t("sources.grade_used", { grade: o.grade }) : undefined, r.message].filter(Boolean).join(" · ")}
                </div>
              )}
              {links.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {links.map((url, j) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={url}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {links.length > 1 ? t("sources.listing_n", { n: j + 1 }) : t("sources.listing")}
                      <span className="text-muted font-normal">· {host(url)}</span>
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Every price behind a quote line, with links to the listings it came from. */
export default function SourcesPanel({ line }: { line: QuoteLine }) {
  const { t } = useTranslation();
  const ok = line.agentResults.filter((r) => r.status === "ok");
  const missing = line.agentResults.filter((r) => r.status !== "ok");
  const estimates = ok.filter((r) => r.kind === "estimate");

  return (
    <div className="rounded-2xl shadow-inner-soft p-5 flex flex-col gap-5 text-xs">
      <div className="font-semibold text-sm">{line.priceBasis ?? t("pricing.no_basis")}</div>
      {line.agentResults.length === 0 ? (
        <div className="text-muted">{t("pricing.no_results")}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <SourceList title={t("sources.buyback")} hint={t("sources.buyback_hint")} results={ok.filter((r) => r.kind === "buyback")} tone="buy" />
          <SourceList title={t("sources.resale")} hint={t("sources.resale_hint")} results={ok.filter((r) => r.kind === "resale")} tone="sell" />
        </div>
      )}
      {estimates.length > 0 && (
        <p className="text-[11px] text-muted">
          {estimates.map((r) => `${r.agent} : ${r.offers.map((o) => eur(o.price)).join(", ")} (${r.message ?? ""})`).join(" · ")}
        </p>
      )}
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold text-muted">{t("sources.missing", { count: missing.length })}</summary>
          <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted">
            {missing.map((r, i) => (
              <li key={i}><span className="font-semibold">{r.agent}</span> — {r.message ?? t(`pricing.status_${r.status}`)}</li>
            ))}
          </ul>
        </details>
      )}
      {line.sourceRows.length > 0 && (
        <div className="text-[11px] text-muted">{t("pricing.source_rows")} {line.sourceRows.slice(0, 30).join(", ")}{line.sourceRows.length > 30 ? "…" : ""}</div>
      )}
    </div>
  );
}
