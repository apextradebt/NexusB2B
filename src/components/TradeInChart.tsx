import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, money, latest, monthLabel, monthsBetween, priceAt, variantLabel, type TradeInModel } from "@/lib/tradein";

// Categorical slots (validated for this app's light and dark surfaces), in fixed order: a capacity
// keeps its color whatever else is shown. Defined in index.css as --series-1..8.
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const PAD = { top: 16, right: 72, bottom: 28, left: 48 };
const HEIGHT = 300;

/** Round tick step (1, 2, 2.5 or 5 × 10^k) giving about four intervals up to `max`. */
function niceTicks(max: number): number[] {
  const raw = (max || 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/**
 * Trade-in price per month, one line per capacity. Hover (or focus + arrow keys) shows every
 * capacity's price for that month; each line is labelled at its end, and a legend sits above.
 */
export default function TradeInChart({ model }: { model: TradeInModel }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => model.variants.slice(0, SERIES.length).map((v, i) => ({ v, color: SERIES[i], label: variantLabel(v) })), [model]);
  const { first, n, max: dataMax } = useMemo(() => {
    const starts = series.map((s) => s.v.start).sort();
    const ends = series.map((s) => addMonths(s.v.start, s.v.prices.length - 1)).sort();
    const first = starts[0];
    const last = ends[ends.length - 1];
    const max = Math.max(...series.flatMap((s) => s.v.prices.filter((p): p is number => p !== null)));
    return { first, n: monthsBetween(first, last) + 1, max };
  }, [series]);

  const ticks = niceTicks(dataMax);
  const max = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (p: number) => PAD.top + plotH - (p / max) * plotH;
  const monthAt = (i: number) => addMonths(first, i);

  // One path per series, broken where a month is missing.
  const paths = series.map((s) => {
    const offset = monthsBetween(first, s.v.start);
    let d = "";
    let pen = false;
    s.v.prices.forEach((p, i) => {
      if (p === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(offset + i).toFixed(1)},${y(p).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  // End labels, pushed apart so they never overlap.
  const ends = series
    .map((s, i) => {
      const l = latest(s.v);
      return l ? { i, y: y(l.price), x: x(monthsBetween(first, l.month)), label: s.label } : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;

  const xTickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));
  const xTicks = Array.from({ length: n }, (_, i) => i).filter((i) => i % xTickEvery === 0);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    if (e.key === "Escape") setHover(null);
  };

  const hoverMonth = hover !== null ? monthAt(hover) : null;
  const tipRows = hoverMonth
    ? series.map((s) => ({ ...s, price: priceAt(s.v, hoverMonth) })).filter((r) => r.price !== undefined).sort((a, b) => b.price! - a.price!)
    : [];
  const tipLeft = hover !== null && x(hover) > width / 2;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende">
        {series.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded-full" style={{ background: s.color }} />
            <span className="font-medium text-ink">{s.label}</span>
          </li>
        ))}
      </ul>
      <div ref={wrap} className="relative w-full">
        <svg width={width} height={HEIGHT} role="img" aria-label="Évolution du prix de reprise par capacité" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">{money(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[11px]">{monthLabel(monthAt(i))}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
          {paths.map((d, i) => (
            <path key={series[i].label} d={d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hoverMonth && series.map((s) => {
            const p = priceAt(s.v, hoverMonth);
            return p === undefined ? null : <circle key={s.label} cx={x(hover!)} cy={y(p)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
          })}
          {ends.map((e) => (
            <text key={e.label} x={e.x + 8} y={e.y} dy="0.32em" className="fill-ink text-[11px] font-semibold">{e.label}</text>
          ))}
          <rect
            x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" tabIndex={0}
            aria-label="Survolez ou utilisez les flèches pour lire les prix d'un mois"
            className="focus:outline-none focus-visible:stroke-[var(--primary)]"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
          />
        </svg>
        {hoverMonth && tipRows.length > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 bg-surface rounded-xl shadow-soft px-3 py-2 text-xs min-w-36"
            style={tipLeft ? { right: width - x(hover!) + 12 } : { left: x(hover!) + 12 }}
          >
            <div className="font-semibold text-ink mb-1 capitalize">{monthLabel(hoverMonth, "long")}</div>
            {tipRows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 py-0.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                <span className="text-muted">{r.label}</span>
                <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{money(r.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
