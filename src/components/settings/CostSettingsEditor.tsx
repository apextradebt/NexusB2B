import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { countryName, countryNote } from "@/lib/messages";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { eur } from "@/lib/pricing";
import { modeLabel } from "@/components/quote/CostPanel";
import {
  COST_CATEGORIES, costBreakdown, EU_MIX, findCountry, schemeForSupplier, vatFor,
  type Channel, type CostCategory, type CostItem, type CostSettings, type Country, type Lane, type LevyBracket, type Supplier, type VatScheme,
} from "@/lib/costs";

const num = (v: string) => (v === "" || isNaN(Number(v)) ? 0 : Number(v));
const ITEMS: CostItem[] = ["inbound", "outbound", "duty", "levy", "eco", "handling", "fees", "vat"];
const th = "p-2 font-semibold";
const cell = "w-full text-center !px-2";

/** Pays, TVA, copie privée, trajets de transport et frais de vente. */
export default function CostSettingsEditor({ value: c, onChange }: { value: CostSettings; onChange: (c: CostSettings) => void }) {
  const { t, i18n } = useTranslation();
  const set = (p: Partial<CostSettings>) => onChange({ ...c, ...p });
  const countryOptions = [...c.countries].map((x) => ({ value: x.code, label: `${countryName(x)} (${x.code})` })).sort((a, b) => a.label.localeCompare(b.label, i18n.language));
  const codeOptions = [...c.countries].sort((a, b) => a.code.localeCompare(b.code)).map((x) => ({ value: x.code, label: x.code }));
  const setCountry = (code: string, p: Partial<Country>) => set({ countries: c.countries.map((x) => (x.code === code ? { ...x, ...p } : x)) });
  // Un trajet modifié n'est plus une estimation : les mises à jour des tarifs par défaut ne le touchent plus.
  const setLane = (i: number, p: Partial<Lane>) => set({ lanes: c.lanes.map((l, j) => (j === i ? { ...l, ...p, estimate: false } : l)) });
  const [levyOpen, setLevyOpen] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");

  const addCountry = () => {
    const code = newCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || findCountry(c, code)) return;
    set({ countries: [...c.countries, { code, name: code, eu: true, vatPct: 20, levy: {} }] });
    setNewCode("");
  };

  return (
    <>
      <Card className="p-8 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">{t("costs.settings_title")}</h2>
          <p className="text-sm text-muted font-medium mt-1">{t("costs.settings_desc")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("costs.home")}
            <Select ariaLabel={t("costs.home")} value={c.home} onChange={(v) => set({ home: v })} options={countryOptions} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("route.buy_from")}
            <Select ariaLabel={t("route.buy_from")} value={c.buyFrom} onChange={(v) => set({ buyFrom: v })} options={countryOptions} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("costs.supplier_default")}
            <Select ariaLabel={t("costs.supplier_default")} value={c.supplier} onChange={(v) => set({ supplier: v as Supplier, vatScheme: schemeForSupplier(v as Supplier) })}
              options={(["business", "business_margin", "consumer"] as Supplier[]).map((v) => ({ value: v, label: t(`route.supplier_${v}`) }))} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("costs.channel_default")}
            <Select ariaLabel={t("costs.channel_default")} value={c.channel} onChange={(v) => set({ channel: v as Channel })}
              options={(["b2c", "b2b"] as Channel[]).map((v) => ({ value: v, label: t(`route.channel_${v}`) }))} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("route.sell_to")}
            <Select ariaLabel={t("route.sell_to")} value={c.sellTo} onChange={(v) => set({ sellTo: v })} options={[{ value: EU_MIX, label: t("route.eu_mix") }, ...countryOptions]} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("route.vat")}
            <Select ariaLabel={t("route.vat")} value={c.vatScheme} onChange={(v) => set({ vatScheme: v as VatScheme })}
              options={(["normal", "margin", "none"] as VatScheme[]).map((v) => ({ value: v, label: t(`route.vat_${v}`) }))} />
          </label>
        </div>
        <p className="text-xs text-muted">{t("costs.vat_desc")}</p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {(["commissionPct", "returnsPct", "paymentPct", "insurancePct", "handlingEur"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-2 text-sm font-semibold">
              {t(`costs.${k}`)}
              <Input type="number" min={0} step={k === "handlingEur" ? 0.5 : 0.1} value={c[k]} onChange={(e) => set({ [k]: num(e.target.value) })} />
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t("costs.ecoFee")}</span>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {COST_CATEGORIES.map((k) => (
              <label key={k} className="flex flex-col gap-1 text-xs text-muted font-semibold">
                {t(`costs.cat_${k}`)}
                <Input type="number" min={0} step={0.01} value={c.ecoFee[k]} onChange={(e) => set({ ecoFee: { ...c.ecoFee, [k]: num(e.target.value) } })} />
              </label>
            ))}
          </div>
          <span className="text-xs text-muted">{t("costs.ecoFee_desc")}</span>
        </div>
      </Card>

      <Card className="p-8 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">{t("costs.countries")}</h2>
          <p className="text-sm text-muted font-medium mt-1">{t("costs.countries_desc")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className={th}>{t("costs.country")}</th>
                <th className={`${th} text-center`}>{t("costs.eu")}</th>
                <th className={`${th} text-center`}>{t("costs.vat_pct")}</th>
                <th className={th}>{t("costs.levy_col")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.countries.map((x) => {
                const open = levyOpen === x.code;
                const summary = (["phone", "tablet", "laptop"] as CostCategory[])
                  .filter((k) => x.levy[k]?.length)
                  .map((k) => {
                    const amounts = x.levy[k]!.map((b) => b.eur);
                    const lo = Math.min(...amounts).toLocaleString("fr-FR"), hi = Math.max(...amounts).toLocaleString("fr-FR");
                    return `${t(`costs.cat_${k}`)} ${lo === hi ? lo : `${lo}–${hi}`} €`;
                  })
                  .join(" · ");
                return (
                  <Fragment key={x.code}>
                  <tr className="border-t border-line align-top">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted w-6">{x.code}</span>
                        <Input aria-label={t("costs.country")} value={countryName(x)} onChange={(e) => setCountry(x.code, { name: e.target.value })} className="!py-1.5 min-w-32" />
                      </div>
                      {x.note && <p className="text-[11px] text-muted mt-1 ml-8 max-w-xs line-clamp-2" title={countryNote(x)}>{countryNote(x)}</p>}
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" aria-label={`${x.code} ${t("costs.eu")}`} checked={x.eu} onChange={(e) => setCountry(x.code, { eu: e.target.checked })} className="accent-[var(--primary)] w-4 h-4 mt-2" />
                    </td>
                    <td className="p-2 w-24">
                      <Input type="number" min={0} step={0.1} aria-label={`${x.code} ${t("costs.vat_pct")}`} value={x.vatPct} onChange={(e) => setCountry(x.code, { vatPct: num(e.target.value) })} className={`${cell} !py-1.5`} />
                    </td>
                    <td className="p-2">
                      <button onClick={() => setLevyOpen(open ? null : x.code)} className="text-xs font-semibold text-primary hover:underline text-left mt-2">
                        {summary || t("costs.no_levy")} · {open ? t("costs.close") : t("costs.edit")}
                      </button>
                    </td>
                    <td className="p-2">
                      <button aria-label={t("costs.remove")} onClick={() => set({ countries: c.countries.filter((y) => y.code !== x.code) })}
                        disabled={x.code === c.home} className="p-1.5 mt-1 rounded-full text-muted hover:text-warn disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={5} className="px-2 pb-4">
                        <LevyEditor country={x} onChange={(p) => setCountry(x.code, p)} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <Input aria-label={t("costs.new_country")} placeholder="SE" maxLength={2} value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-20 text-center uppercase" />
          <Button variant="soft" onClick={addCountry}><Plus className="w-4 h-4" /> {t("costs.add_country")}</Button>
        </div>
      </Card>

      <Card className="p-8 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">{t("costs.lanes")}</h2>
          <p className="text-sm text-muted font-medium mt-1">{t("costs.lanes_desc", { home: c.home })}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className={th}>{t("costs.from")}</th>
                <th className={th} />
                <th className={th}>{t("costs.to")}</th>
                {COST_CATEGORIES.map((k) => <th key={k} className={`${th} text-center`}>{t(`costs.cat_${k}`)}<div className="normal-case font-medium">€ / u.</div></th>)}
                <th className={`${th} text-center`}>{t("costs.lot_per_unit")}</th>
                <th className={`${th} text-center`}>{t("costs.per_shipment")}</th>
                <th className={`${th} text-center`}>{t("costs.duty_pct")}</th>
                <th className={`${th} text-center`}>{t("costs.clearance")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.lanes.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="p-2"><Select ariaLabel={t("costs.from")} value={l.from} onChange={(v) => setLane(i, { from: v })} options={codeOptions} className="w-20" /></td>
                  <td className="p-1 text-muted"><ArrowRight className="w-4 h-4" /></td>
                  <td className="p-2"><Select ariaLabel={t("costs.to")} value={l.to} onChange={(v) => setLane(i, { to: v })} options={codeOptions} className="w-20" /></td>
                  {COST_CATEGORIES.map((k) => (
                    <td key={k} className="p-2 w-20">
                      <Input type="number" min={0} step={0.5} aria-label={`${l.from}→${l.to} ${k}`} value={l.perUnit[k]} onChange={(e) => setLane(i, { perUnit: { ...l.perUnit, [k]: num(e.target.value) } })} className={cell} />
                    </td>
                  ))}
                  <td className="p-2 w-20"><Input type="number" min={0} step={0.5} aria-label={t("costs.lot_per_unit")} placeholder={t("costs.parcel")} value={l.lotPerUnit ?? ""} onChange={(e) => setLane(i, { lotPerUnit: e.target.value === "" ? undefined : num(e.target.value) })} className={cell} /></td>
                  <td className="p-2 w-24"><Input type="number" min={0} aria-label={t("costs.per_shipment")} value={l.perShipment} onChange={(e) => setLane(i, { perShipment: num(e.target.value) })} className={cell} /></td>
                  <td className="p-2 w-20"><Input type="number" min={0} step={0.1} aria-label={t("costs.duty_pct")} value={l.dutyPct} onChange={(e) => setLane(i, { dutyPct: num(e.target.value) })} className={cell} /></td>
                  <td className="p-2 w-20"><Input type="number" min={0} aria-label={t("costs.clearance")} value={l.clearanceEur} onChange={(e) => setLane(i, { clearanceEur: num(e.target.value) })} className={cell} /></td>
                  <td className="p-2">
                    {l.estimate && <span title={t("costs.estimate_hint")} className="text-[10px] font-bold uppercase tracking-wider text-muted mr-1 whitespace-nowrap">{t("costs.estimate")}</span>}
                    <button aria-label={t("costs.remove")} onClick={() => set({ lanes: c.lanes.filter((_, j) => j !== i) })} className="p-1.5 rounded-full text-muted hover:text-warn">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t("costs.devices_per_pallet")}</span>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {COST_CATEGORIES.map((k) => (
              <label key={k} className="flex flex-col gap-1 text-xs text-muted font-semibold">
                {t(`costs.cat_${k}`)}
                <Input type="number" min={1} value={c.devicesPerPallet[k]} onChange={(e) => set({ devicesPerPallet: { ...c.devicesPerPallet, [k]: Math.max(1, num(e.target.value)) } })} />
              </label>
            ))}
          </div>
          <span className="text-xs text-muted">{t("costs.devices_per_pallet_desc")}</span>
        </div>
        <div>
          <Button variant="soft" onClick={() => set({ lanes: [...c.lanes, { from: c.home, to: c.home, perUnit: { phone: 0, tablet: 0, laptop: 0 }, lotPerUnit: 1, perShipment: 0, dutyPct: 0, clearanceEur: 0 }] })}>
            <Plus className="w-4 h-4" /> {t("costs.add_lane")}
          </Button>
        </div>
      </Card>

      <Card className="p-8 flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">{t("costs.market_mix")}</h2>
          <p className="text-sm text-muted font-medium mt-1">{t("costs.market_mix_desc")}</p>
        </div>
        <MarketMixEditor mix={c.marketMix} codes={codeOptions} onChange={(marketMix) => set({ marketMix })} />
      </Card>

      <Simulator c={c} countryOptions={countryOptions} />
    </>
  );
}

/** Pays d'acheteur → % des ventes marketplace. */
function MarketMixEditor({ mix, codes, onChange }: { mix: Record<string, number>; codes: { value: string; label: string }[]; onChange: (m: Record<string, number>) => void }) {
  const { t } = useTranslation();
  const rows = Object.entries(mix);
  const total = Math.round(rows.reduce((a, [, pct]) => a + pct, 0) * 10) / 10;
  const free = codes.filter((o) => !(o.value in mix));
  const rename = (from: string, to: string) => onChange(Object.fromEntries(rows.map(([k, v]) => [k === from ? to : k, v])));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {rows.map(([code, pct]) => (
          <div key={code} className="flex items-center gap-1.5 rounded-xl bg-whisper/30 dark:bg-hunter/20 px-2 py-1.5">
            <Select ariaLabel={t("costs.country")} value={code} onChange={(v) => rename(code, v)} options={[{ value: code, label: code }, ...free]} className="w-20" />
            <Input type="number" min={0} max={100} aria-label={`${code} %`} value={pct} onChange={(e) => onChange({ ...mix, [code]: num(e.target.value) })} className="w-20 !px-2 !py-1 text-center" />
            <span className="text-xs text-muted">%</span>
            <button aria-label={t("costs.remove")} onClick={() => onChange(Object.fromEntries(rows.filter(([k]) => k !== code)))} className="text-muted hover:text-warn"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4">
        {free.length > 0 && (
          <Button variant="soft" onClick={() => onChange({ ...mix, [free[0].value]: 0 })}><Plus className="w-4 h-4" /> {t("costs.add_mix")}</Button>
        )}
        <span className={`text-sm font-semibold ${total === 100 ? "text-muted" : "text-warn"}`}>{t("costs.market_mix_total", { pct: total })}</span>
      </div>
    </div>
  );
}

function LevyEditor({ country, onChange }: { country: Country; onChange: (p: Partial<Country>) => void }) {
  const { t } = useTranslation();
  const setRows = (k: CostCategory, rows: LevyBracket[]) => onChange({ levy: { ...country.levy, [k]: rows } });
  const setEpr = (k: CostCategory, v: string) => {
    const epr = { ...country.epr };
    if (v === "") delete epr[k];
    else epr[k] = num(v);
    onChange({ epr });
  };
  return (
    <div className="rounded-2xl bg-whisper/30 dark:bg-hunter/20 p-4 grid sm:grid-cols-3 gap-6">
      {COST_CATEGORIES.map((k) => {
        const rows = country.levy[k] ?? [];
        return (
          <div key={k} className="flex flex-col gap-1.5">
            <span className="text-xs font-bold">{t(`costs.cat_${k}`)}</span>
            {rows.length === 0 && <span className="text-xs text-muted">{t("costs.no_levy")}</span>}
            {rows.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-muted w-8">{t("costs.up_to")}</span>
                <Input type="number" min={0} aria-label={t("costs.up_to")} placeholder="∞" value={b.upToGb ?? ""}
                  onChange={(e) => setRows(k, rows.map((r, j) => (j === i ? { ...r, upToGb: e.target.value === "" ? null : num(e.target.value) } : r)))} className="w-20 !px-2 !py-1 text-center" />
                <span className="text-muted">Go</span>
                <Input type="number" min={0} step={0.01} aria-label="€" value={b.eur}
                  onChange={(e) => setRows(k, rows.map((r, j) => (j === i ? { ...r, eur: num(e.target.value) } : r)))} className="w-20 !px-2 !py-1 text-center" />
                <span className="text-muted">€</span>
                <button aria-label={t("costs.remove")} onClick={() => setRows(k, rows.filter((_, j) => j !== i))} className="text-muted hover:text-warn"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => setRows(k, [...rows, { upToGb: null, eur: 0 }])} className="self-start text-xs font-semibold text-primary hover:underline">+ {t("costs.add_bracket")}</button>
          </div>
        );
      })}
      <p className="sm:col-span-3 text-[11px] text-muted">{t("costs.levy_desc")}</p>
      <div className="sm:col-span-3 flex flex-col gap-1.5">
        <span className="text-xs font-bold">{t("costs.epr_country")}</span>
        <div className="flex flex-wrap gap-4">
          {COST_CATEGORIES.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-xs text-muted">
              {t(`costs.cat_${k}`)}
              <Input type="number" min={0} step={0.01} placeholder={t("costs.epr_default")} value={country.epr?.[k] ?? ""} onChange={(e) => setEpr(k, e.target.value)} className="w-24 !px-2 !py-1 text-center" />
              €
            </label>
          ))}
        </div>
      </div>
      <label className="sm:col-span-3 flex flex-col gap-1.5 text-xs font-bold">
        {t("costs.note")}
        <textarea value={country.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} rows={2}
          className="bg-surface shadow-inner-soft rounded-xl px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </label>
    </div>
  );
}

/** « Un téléphone acheté en France et revendu en Finlande, combien ça coûte ? » */
function Simulator({ c, countryOptions }: { c: CostSettings; countryOptions: { value: string; label: string }[] }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(c.buyFrom);
  const [to, setTo] = useState("FI");
  const [vatScheme, setVatScheme] = useState<VatScheme>(c.vatScheme);
  const [channel, setChannel] = useState<Channel>(c.channel);
  const [category, setCategory] = useState<CostCategory>("phone");
  const [storage, setStorage] = useState("128");
  const [sell, setSell] = useState(400);
  const [buy, setBuy] = useState(250);
  const [lot, setLot] = useState(50);
  const route = { buyFrom: from, sellTo: to, vatScheme, channel };
  const b = costBreakdown(c, route, { category, storage: `${storage}GB`, sell, refurb: 0, lotUnits: lot }, buy);
  const toLabel = to === EU_MIX ? t("route.eu_mix_short") : to;
  const vat = vatFor(c, route);
  return (
    <Card className="p-8 flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">{t("costs.simulator")}</h2>
        <p className="text-sm text-muted font-medium mt-1">{t("costs.simulator_desc")}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("route.buy_from")}<Select value={from} onChange={setFrom} options={countryOptions} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("route.sell_to")}<Select value={to} onChange={setTo} options={[{ value: EU_MIX, label: t("route.eu_mix") }, ...countryOptions]} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("route.channel")}
          <Select value={channel} onChange={(v) => setChannel(v as Channel)} options={(["b2c", "b2b"] as Channel[]).map((v) => ({ value: v, label: t(`route.channel_${v}`) }))} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("route.vat")}
          <Select value={vatScheme} onChange={(v) => setVatScheme(v as VatScheme)} options={(["normal", "margin", "none"] as VatScheme[]).map((v) => ({ value: v, label: t(`route.vat_${v}`) }))} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("costs.category")}
          <Select value={category} onChange={(v) => setCategory(v as CostCategory)} options={COST_CATEGORIES.map((k) => ({ value: k, label: t(`costs.cat_${k}`) }))} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("costs.storage_gb")}<Input type="number" min={0} value={storage} onChange={(e) => setStorage(e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("costs.sell")}<Input type="number" min={0} value={sell} onChange={(e) => setSell(num(e.target.value))} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("costs.buy")}<Input type="number" min={0} value={buy} onChange={(e) => setBuy(num(e.target.value))} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{t("costs.lot_units")}<Input type="number" min={1} value={lot} onChange={(e) => setLot(Math.max(1, num(e.target.value)))} /></label>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm max-w-md">
        {ITEMS.filter((k) => b.items[k]).map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted">{t(`costs.${k}`, { from, to: toLabel, home: c.home, pct: vat.pct, country: vat.country ?? toLabel, mode: modeLabel(t, k === "inbound" ? b.modes.inbound : k === "outbound" ? b.modes.outbound : undefined) })}</dt>
            <dd className="text-right tabular-nums">{b.items[k]!.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd>
          </div>
        ))}
        <dt className="font-bold border-t border-line pt-1">{t("costs.total")}</dt>
        <dd className="text-right tabular-nums font-bold border-t border-line pt-1">{b.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd>
        <dt className="font-bold">{t("costs.net")}</dt>
        <dd className={`text-right tabular-nums font-bold ${sell - buy - b.total < 0 ? "text-warn" : "text-sell"}`}>{eur(Math.round(sell - buy - b.total))}</dd>
      </dl>
      {b.missingLanes.length > 0 && <p className="text-xs text-warn font-semibold">{t("route.missing_lane", { lanes: b.missingLanes.join(", ") })}</p>}
    </Card>
  );
}
