import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bot, Check, FilePlus2, History, Laptop, Loader2, RefreshCw, Search, Smartphone, Tag, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Chip, Input, PageHeader, Select, Stat } from "@/components/ui";
import SourcesPanel from "@/components/quote/SourcesPanel";
import { agentsFor, runAgents } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { CATALOG, getRef, phoneStorage } from "@/lib/catalog";
import { manualLine, mergeDuplicates } from "@/lib/group";
import { matchAgainst, matchLine } from "@/lib/match";
import { suggest, type Suggestion } from "@/lib/suggest";
import { extractInline, parseGrade, parsePrice } from "@/lib/parse";
import { eur, marginRate, marketGap, priceLine } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { Grade, QuoteLine, RefModel } from "@/types";
import { GRADES } from "@/types";

type Variant = QuoteLine["variant"];
type Recent = { text: string; refId: string; variant: Variant; grade: Grade; sell?: number; buy?: number; at: string };
const HISTORY_KEY = "b2b-quick-history";

const MODEL_OPTIONS = [
  { value: "", label: "—" },
  ...CATALOG.map((r) => ({ value: r.id, label: `${r.category === "laptop" ? "PC" : "Tél."} · ${r.brand} ${r.model}` })),
];

function loadHistory(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

/** The grade written in the query ("grade B", "Class C", or a lone trailing "B"), and the rest of the text. */
function gradeIn(text: string): { grade?: Grade; rest: string } {
  const inline = extractInline(text);
  const grade = parseGrade(inline.grade);
  const trailing = inline.text.match(/\s([A-E])\+?$/);
  if (!grade && trailing) return { grade: trailing[1] as Grade, rest: inline.text.slice(0, trailing.index) };
  return { grade, rest: inline.text };
}

/** Read "iPhone 13 128 Go grade B" / "Latitude 5420 i5-1145G7 16/256 B": device, configuration, grade. */
function understand(text: string, fallback: Grade) {
  const { grade, rest } = gradeIn(text);
  return { match: matchLine({ row: 0, text: rest, quantity: 1 }), grade: grade ?? fallback };
}

/** Configuration typed in the query, resolved against the chosen model's factory options. */
function variantFor(r: RefModel, text: string): Variant {
  const m = matchAgainst({ row: 0, text: gradeIn(text).rest, quantity: 1 }, r);
  return r.category === "phone" ? (m.variant.storage ? { storage: m.variant.storage } : {}) : m.variant;
}

/**
 * Price one device without building a quote: type it (or pick it), the agents look up buyback and
 * resale prices, and the page shows the buy price that keeps the target margin, next to your own price.
 */
export default function QuickSearch() {
  const { t } = useTranslation();
  const { settings, priceList, setPrice, setDraft, draft } = useStore();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [refId, setRefId] = useState("");
  const [variant, setVariant] = useState<Variant>({});
  const [grade, setGrade] = useState<Grade>(settings.defaultGrade);
  const [alternatives, setAlternatives] = useState<RefModel[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [line, setLine] = useState<QuoteLine | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Recent[]>(loadHistory);
  const [qty, setQty] = useState("1");
  const [myPrice, setMyPrice] = useState("");
  const [done, setDone] = useState<"quote" | "price" | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const run = useRef(0);
  const suggestions = useMemo(() => suggest(text, 10), [text]);

  const ref = getRef(refId);
  const priced = useMemo(() => (line ? priceLine(line, settings, priceList) : null), [line, settings, priceList]);

  const search = async (r: RefModel, v: Variant, g: Grade, label: string) => {
    const id = ++run.current;
    const base = manualLine(r, v, g, 1);
    setLine({ ...base, priceState: "running" });
    setRunning(true);
    setDone(null);
    const agentResults = await runAgents(base, agentsFor(settings.gradeCoef), await getToken());
    if (id !== run.current) return; // a newer search started meanwhile
    const result: QuoteLine = { ...base, priceState: "done", agentResults };
    setLine(result);
    setRunning(false);
    const p = priceLine(result, settings, priceList);
    setMyPrice(String(p.listPrice ?? p.marketSell ?? ""));
    const entry: Recent = { text: label, refId: r.id, variant: v, grade: g, sell: p.sellPrice, buy: p.buyPrice, at: new Date().toISOString() };
    setHistory((h) => {
      const next = [entry, ...h.filter((x) => !(x.refId === r.id && JSON.stringify(x.variant) === JSON.stringify(v) && x.grade === g))].slice(0, 10);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  };

  const pick = (r: RefModel, v: Variant, g: Grade) => {
    setRefId(r.id);
    setVariant(v);
    setGrade(g);
    setAlternatives([]);
    setNotFound(false);
  };

  /** A suggestion was picked: its capacity (phones), else the configuration typed; the grade typed. */
  const choose = ({ ref: r, variant: sv }: Suggestion) => {
    const v = sv.storage ? { ...variantFor(r, text), ...sv } : variantFor(r, text);
    const g = gradeIn(text).grade ?? grade;
    pick(r, v, g);
    setOpen(false);
    setActive(-1);
    search(r, v, g, text.trim() || `${r.brand} ${r.model}`);
  };

  const submitText = () => {
    if (!text.trim()) return;
    if (open && active >= 0 && suggestions[active]) return choose(suggestions[active]);
    setOpen(false);
    const { match, grade: g } = understand(text, settings.defaultGrade);
    // Nothing certain from the full reading: take the first suggestion, as a search box would.
    if ((!match.ref || match.status === "unmatched") && suggestions[0]) return choose(suggestions[0]);
    if (!match.ref) {
      setNotFound(true);
      setAlternatives([]);
      setLine(null);
      return;
    }
    const v = match.ref.category === "phone" ? { storage: match.variant.storage } : match.variant;
    pick(match.ref, v, g);
    setAlternatives(match.status === "review" ? match.alternatives.filter((a) => a.ref.id !== match.ref!.id).slice(0, 4).map((a) => a.ref) : []);
    search(match.ref, v, g, text.trim());
  };

  const opt = (xs?: string[]) => [{ value: "", label: "?" }, ...(xs ?? []).map((x) => ({ value: x, label: x }))];
  const ramOptions = variant.cpu?.startsWith("Ryzen") && ref?.ramAmd ? ref.ramAmd : ref?.ram;
  const label = ref ? `${ref.brand} ${ref.model} ${[variant.cpu, variant.ram, variant.storage].filter(Boolean).join(" ")}`.trim() : "";
  const rate = priced ? marginRate(priced) : undefined;
  const gap = priced ? marketGap(priced) : undefined;

  const addToQuote = () => {
    if (!ref) return;
    const l = manualLine(ref, variant, grade, Number(qty) || 1);
    setDraft((d) => ({ ...d, step: Math.max(d.step, 2), lines: mergeDuplicates([...d.lines, l]) }));
    setDone("quote");
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-12">
      <PageHeader title={t("quick.title")} desc={t("quick.desc")} />

      <Card className="p-6 sm:p-8 flex flex-col gap-5">
        <form className="flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); submitText(); }}>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-4 top-1/2 -translate-y-1/2 z-10" />
            <Input
              autoFocus
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls="quick-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `quick-s-${active}` : undefined}
              autoComplete="off"
              value={text}
              onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); setNotFound(false); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % suggestions.length); }
                else if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)); }
                else if (e.key === "Escape") { setOpen(false); setActive(-1); }
              }}
              placeholder={t("quick.placeholder")}
              aria-label={t("quick.placeholder")}
              className="w-full pl-10 rounded-full py-3"
            />
            {open && suggestions.length > 0 && (
              <ul id="quick-suggestions" role="listbox" aria-label={t("quick.suggestions")}
                className="absolute z-30 left-0 right-0 mt-2 bg-surface rounded-2xl shadow-soft p-2 max-h-96 overflow-y-auto">
                {suggestions.map((s, i) => {
                  const r = s.ref;
                  const v = variantFor(r, text);
                  const g = gradeIn(text).grade;
                  // Phones show their capacity in the name; laptops the configuration typed.
                  const chips = [...(r.category === "laptop" ? [v.cpu, v.ram, v.storage] : []), g && `Grade ${g}`].filter(Boolean);
                  return (
                    <li key={`${r.id}-${s.variant.storage ?? ""}`} id={`quick-s-${i}`} role="option" aria-selected={i === active}
                      onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${i === active ? "bg-lime/20" : "hover:bg-line/40"}`}>
                      {r.category === "laptop" ? <Laptop className="w-4 h-4 text-muted shrink-0" /> : <Smartphone className="w-4 h-4 text-muted shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-muted">{r.brand} </span><span className="font-semibold">{r.model}</span>
                        {s.variant.storage && <span className="font-bold text-primary ml-2 tabular-nums">{s.variant.storage}</span>}
                        {r.year && <span className="text-xs text-muted ml-2">{r.year}</span>}
                      </span>
                      {chips.length > 0 && <span className="hidden sm:flex gap-1">{chips.map((c) => <Chip key={c}>{c}</Chip>)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Button type="submit" disabled={!text.trim() || running}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />} {t("quick.search")}</Button>
        </form>

        {notFound && <p role="alert" className="text-sm font-semibold text-warn">{t("quick.not_found")}</p>}

        <div className="flex flex-col gap-3 pt-4 border-t border-line">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t("quick.device")}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <Select ariaLabel={t("match.device")} value={refId} className="min-w-64 max-w-full"
              onChange={(v) => { const r = getRef(v); setRefId(v); setVariant({}); setLine(null); if (r) setAlternatives([]); }} options={MODEL_OPTIONS} />
            {ref?.category === "laptop" && (
              <>
                <Select ariaLabel="CPU" value={variant.cpu ?? ""} onChange={(v) => setVariant((x) => ({ ...x, cpu: v || undefined }))} options={opt(ref.cpu)} />
                <Select ariaLabel="RAM" value={variant.ram ?? ""} onChange={(v) => setVariant((x) => ({ ...x, ram: v || undefined }))} options={opt(ramOptions)} />
                <Select ariaLabel={t("fields.storage")} value={variant.storage ?? ""} onChange={(v) => setVariant((x) => ({ ...x, storage: v || undefined }))} options={opt(ref.storage)} />
              </>
            )}
            {ref?.category === "phone" && (
              <Select ariaLabel={t("add.capacity")} value={variant.storage ?? ""} onChange={(v) => setVariant({ storage: v || undefined })} options={opt(phoneStorage(ref))} />
            )}
            <Select ariaLabel={t("fields.grade")} value={grade} onChange={(v) => setGrade(v as Grade)} options={GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))} />
            <Button variant="soft" disabled={!ref || running} onClick={() => ref && search(ref, variant, grade, label)}>
              <RefreshCw className="w-4 h-4" /> {line ? t("quick.rerun") : t("quick.search")}
            </Button>
          </div>
          {alternatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-warn font-semibold">{t("quick.did_you_mean")}</span>
              {alternatives.map((a) => (
                <button key={a.id} onClick={() => { pick(a, {}, grade); search(a, {}, grade, `${a.brand} ${a.model}`); }}
                  className="px-3 py-1 rounded-full bg-sand/20 text-warn font-semibold hover:bg-sand/35">{a.brand} {a.model}</button>
              ))}
            </div>
          )}
          {ref?.category === "laptop" && (!variant.cpu || !variant.ram || !variant.storage) && <p className="text-xs text-warn font-medium">{t("add.incomplete")}</p>}
        </div>
      </Card>

      {line && priced && (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold">{line.brand} {line.model}</h2>
            <div className="flex flex-wrap gap-1.5">
              {line.category === "laptop"
                ? [line.variant.cpu, line.variant.ram, line.variant.storage].map((v, i) => <Chip key={i} muted={!v}>{v || "?"}</Chip>)
                : <Chip muted={!line.variant.storage}>{line.variant.storage || "?"}</Chip>}
              <Chip>Grade {line.grade}</Chip>
            </div>
            {running && <span className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> {t("quick.running")}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <Stat label={t("quick.market_sell")} tone="sell" value={running ? "…" : eur(priced.marketSell)}
              hint={priced.marketSell === undefined ? t("quick.no_market") : t("quick.sources", { count: line.agentResults.filter((r) => r.kind !== "buyback" && r.status === "ok").length })} />
            <Stat label={t("quick.market_buy")} tone="buy" value={running ? "…" : eur(priced.marketBuy)} hint={t("quick.market_buy_hint")} />
            <Stat label={t("quick.your_price")} value={eur(priced.listPrice)}
              hint={priced.listPrice === undefined ? t("quick.no_list_price") : [priced.listPriceNote, gap !== undefined ? t("quick.vs_market", { pct: `${gap > 0 ? "+" : ""}${Math.round(gap * 100)}` }) : undefined].filter(Boolean).join(" · ")} />
            <div className="rounded-[2rem] hero-gradient text-bright p-6 flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider">{t("quick.offer")}</span>
              <span className="text-3xl font-bold tabular-nums">{running && priced.listPrice === undefined ? "…" : eur(priced.buyPrice)}</span>
              <span className="text-xs text-whisper">
                {priced.buyPrice !== undefined && priced.sellPrice !== undefined
                  ? t("quick.offer_hint", { sell: eur(priced.sellPrice), margin: eur(priced.sellPrice - priced.buyPrice), pct: rate !== undefined ? Math.round(rate * 100) : "—" })
                  : running ? t("quick.running") : t("quick.no_offer")}
              </span>
            </div>
          </div>
          {priced.priceBasis && <p className="text-xs text-muted -mt-4">{t("quick.basis")} : {priced.priceBasis}</p>}
          {!running && gap !== undefined && gap >= 0.15 && priced.priceBasis?.startsWith("Votre") && (
            <p role="alert" className="text-sm font-semibold text-warn bg-sand/15 rounded-2xl px-5 py-3 flex gap-2 -mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t("quick.above_market", { pct: Math.round(gap * 100), market: eur(priced.marketSell) })}
                {priced.marketBuy !== undefined && priced.buyPrice !== undefined && priced.buyPrice > priced.marketBuy && ` ${t("quick.above_buyback", { offer: eur(priced.buyPrice), buyback: eur(priced.marketBuy) })}`}
                {` ${t("quick.prudent_tip")}`}
              </span>
            </p>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-6 flex flex-col gap-3">
              <h3 className="font-bold flex items-center gap-2"><FilePlus2 className="w-4 h-4" /> {t("quick.add_to_quote")}</h3>
              <p className="text-xs text-muted">{draft.lines.length ? t("quick.quote_has", { count: draft.lines.length }) : t("quick.quote_new")}</p>
              <div className="flex gap-2">
                <Input aria-label={t("fields.quantity")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} className="w-24" />
                <Button onClick={addToQuote}>{done === "quote" ? <Check className="w-4 h-4" /> : <FilePlus2 className="w-4 h-4" />} {done === "quote" ? t("add.added") : t("add.submit")}</Button>
                {done === "quote" && <Button variant="ghost" onClick={() => navigate("/")}>{t("quick.open_quote")}</Button>}
              </div>
            </Card>
            <Card className="p-6 flex flex-col gap-3">
              <h3 className="font-bold flex items-center gap-2"><Tag className="w-4 h-4" /> {t("quick.save_price")}</h3>
              <p className="text-xs text-muted">{t("quick.save_price_hint", { device: `${line.model} ${line.variant.storage ?? ""} · grade ${line.grade}` })}</p>
              <div className="flex gap-2">
                <Input aria-label={t("prices.price")} inputMode="decimal" value={myPrice} onChange={(e) => setMyPrice(e.target.value)} placeholder="€" className="w-28" />
                <Button variant="soft" disabled={!ref || parsePrice(myPrice) === undefined}
                  onClick={() => { if (ref) { setPrice(ref, line.variant, line.grade, parsePrice(myPrice)!.value); setDone("price"); } }}>
                  {done === "price" ? <Check className="w-4 h-4" /> : <Tag className="w-4 h-4" />} {done === "price" ? t("quick.saved") : t("prices.add_submit")}
                </Button>
              </div>
            </Card>
          </div>

          {!running && (
            <Card className="p-6">
              <SourcesPanel line={priced} />
            </Card>
          )}
        </>
      )}

      {history.length > 0 && (
        <Card className="p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2"><History className="w-4 h-4" /> {t("quick.recent")}</h3>
            <button onClick={() => { setHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ } }} className="text-xs text-muted hover:text-ink inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> {t("quick.clear_recent")}</button>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {history.map((h) => {
              const r = getRef(h.refId);
              if (!r) return null;
              return (
                <li key={`${h.refId}${JSON.stringify(h.variant)}${h.grade}`}>
                  <button onClick={() => { pick(r, h.variant, h.grade); setText(h.text); search(r, h.variant, h.grade, h.text); }}
                    className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 px-2 text-left rounded-xl hover:bg-line/30 text-sm">
                    <span className="font-semibold">{r.brand} {r.model}</span>
                    <span className="text-xs text-muted">{[h.variant.cpu, h.variant.ram, h.variant.storage].filter(Boolean).join(" · ")} · {h.grade}</span>
                    <span className="ml-auto tabular-nums text-xs">
                      <span className="text-sell font-semibold">{eur(h.sell)}</span> · <span className="text-buy font-semibold">{eur(h.buy)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
