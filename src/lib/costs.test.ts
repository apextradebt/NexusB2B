import { describe, expect, it } from "vitest";
import { bracketLabel, buyForNet, costBreakdown, declarationDeadline, DEFAULT_COSTS, EU_MIX, palletsFor, levyFor, levyReport, missingLanes, netMargin, normalizeCosts, routeRules, storageGb, vatFor, type CostInput, type CostSettings, type LevyRow, type Route } from "@/lib/costs";

const bare: CostSettings = { ...DEFAULT_COSTS, commissionPct: 0, returnsPct: 0, lanes: DEFAULT_COSTS.lanes };
const phone = (sell: number, storage = "128GB", lotUnits = 0): CostInput => ({ category: "phone", storage, sell, refurb: 20, lotUnits });
const route = (buyFrom: string, sellTo: string, vatScheme: Route["vatScheme"] = "margin"): Route => ({ buyFrom, sellTo, vatScheme });

describe("storageGb", () => {
  it("reads GB, TB and MB", () => {
    expect(storageGb("128GB")).toBe(128);
    expect(storageGb("1TB")).toBe(1000);
    expect(storageGb("1 To")).toBe(1000);
    expect(storageGb("256GB SSD")).toBe(256);
    expect(storageGb("512 Mo")).toBe(0.512);
    expect(storageGb("")).toBeUndefined();
  });
});

describe("copie privée", () => {
  const fr = DEFAULT_COSTS.countries.find((c) => c.code === "FR")!;
  it("follows the refurbished phone schedule (décision n° 23)", () => {
    expect(levyFor(fr.levy.phone, 8)).toBe(2.4);
    expect(levyFor(fr.levy.phone, 64)).toBe(7.2);
    expect(levyFor(fr.levy.phone, 128)).toBe(8.4);
    expect(levyFor(fr.levy.tablet, 16)).toBe(5.2);
  });
  it("takes the top bracket when the capacity is unknown", () => {
    expect(levyFor(fr.levy.phone, undefined)).toBe(8.4);
  });
  it("is due when resold in France only, never on laptops", () => {
    expect(costBreakdown(bare, route("FR", "FR"), phone(300), 100).items.levy).toBe(8.4);
    expect(costBreakdown(bare, route("FR", "FI"), phone(300), 100).items.levy).toBeUndefined();
    expect(costBreakdown(bare, route("FR", "FR"), { ...phone(300), category: "laptop" }, 100).items.levy).toBeUndefined();
  });
});

describe("TVA", () => {
  it("margin scheme: VAT of the shipping country, even for a Finnish buyer", () => {
    expect(vatFor(bare, route("FR", "FI", "margin"))).toEqual({ pct: 20, country: "FR" });
  });
  it("normal scheme: VAT of the buyer's country (OSS)", () => {
    expect(vatFor(bare, route("FR", "FI", "normal"))).toEqual({ pct: 25.5, country: "FI" });
  });
  it("no VAT on an export outside the EU", () => {
    expect(vatFor(bare, route("FR", "CH", "normal")).pct).toBe(0);
  });
  it("margin scheme taxes the margin only", () => {
    const b = costBreakdown(bare, route("FR", "FR", "margin"), phone(300), 180);
    expect(b.items.vat).toBe(20); // 120 × 20/120
  });
});

describe("transport", () => {
  it("adds the leg to the centre and the leg to the buyer, and spreads the per-shipment fee over the lot", () => {
    const b = costBreakdown(bare, route("FI", "FR"), phone(300, "128GB", 100), 100);
    expect(b.items.inbound).toBe(1 + 4.8); // lot : 1 €/u. + palette 480 € / 100 u.
    expect(b.items.outbound).toBe(6.5); // colis vers un particulier en France
    expect(b.missingLanes).toEqual([]);
  });
  it("reports a missing lane instead of guessing", () => {
    expect(costBreakdown(bare, route("NO", "FR"), phone(300), 100).missingLanes).toEqual(["NO→FR"]);
  });
  it("adds customs clearance outside the EU", () => {
    expect(costBreakdown(bare, route("GB", "FR"), phone(300, "128GB", 30), 100).items.duty).toBe(2);
  });
});

describe("buyForNet", () => {
  const cases: [string, Route, CostSettings][] = [
    ["margin scheme", route("FR", "FR", "margin"), DEFAULT_COSTS],
    ["normal scheme", route("FI", "FI", "normal"), { ...DEFAULT_COSTS, paymentPct: 1, insurancePct: 0.5 }],
    ["no VAT", route("GB", "FR", "none"), DEFAULT_COSTS],
  ];
  for (const [name, r, c] of cases) {
    it(`leaves the target net margin (${name})`, () => {
      const x = phone(400, "256GB", 50);
      const buy = buyForNet(c, r, x, 60);
      const net = netMargin(c, r, x, buy);
      expect(net).toBeGreaterThanOrEqual(60);
      expect(net).toBeLessThan(61.5); // floor to the euro
    });
  }
  it("matches the old B2B formula when every extra cost is off", () => {
    const none: CostSettings = { ...bare, lanes: [], countries: [], handlingEur: 0 };
    const x = { ...phone(400), refurb: 20 };
    expect(buyForNet(none, route("FR", "FR", "none"), x, 400 * 0.25)).toBe(Math.floor(400 * 0.75 - 20));
  });
  it("never goes below zero", () => {
    expect(buyForNet(DEFAULT_COSTS, route("FR", "FR"), phone(20), 50)).toBe(0);
  });
});

describe("normalizeCosts", () => {
  it("fills fields saved before they existed", () => {
    const old = { home: "FR", commissionPct: 10 } as Partial<CostSettings>;
    const n = normalizeCosts(old);
    expect(n.commissionPct).toBe(10);
    expect(n.ecoFee.phone).toBe(0);
    expect(n.lanes.length).toBeGreaterThan(0);
  });
});

describe("levyReport", () => {
  const row = (p: Partial<LevyRow>): LevyRow => ({ date: "2026-10-05", ref: "DEV-1", source: "Paris", buyFrom: "FR", category: "phone", brand: "Apple", model: "iPhone 13", storage: "128GB", quantity: 1, ...p });
  const r = levyReport(DEFAULT_COSTS, [
    row({ quantity: 3 }),
    row({ storage: "64GB" }),
    row({ storage: undefined, ref: "DEV-2" }),
    row({ category: "tablet", storage: "256GB" }),
    row({ category: "laptop", storage: "512GB" }),
    row({ sellTo: "FI", ref: "B2B-1", quantity: 10 }),
  ], "FR");
  it("prices each line by its bracket and groups them like the declaration", () => {
    expect(r.summary).toEqual([
      { category: "phone", bracket: "> 32 Go ≤ 64 Go", unitLevy: 7.2, quantity: 1, total: 7.2 },
      { category: "phone", bracket: "> 64 Go", unitLevy: 8.4, quantity: 4, total: 33.6 },
      { category: "tablet", bracket: "> 64 Go", unitLevy: 9.1, quantity: 1, total: 9.1 },
    ]);
    expect(r.total).toBe(49.9);
    expect(r.units).toBe(17);
    expect(r.leviedUnits).toBe(6);
  });
  it("flags unknown capacities, laptops and devices resold abroad", () => {
    expect(r.unknownStorage).toBe(1);
    expect(r.lines.find((l) => l.category === "laptop")!.note).toBe("not_levied");
    expect(r.lines.find((l) => l.ref === "B2B-1")).toMatchObject({ note: "resold_abroad", total: 0 });
  });
  it("labels small brackets in Mo", () => {
    const fr = DEFAULT_COSTS.countries.find((c) => c.code === "FR")!;
    expect(bracketLabel(fr.levy.phone!, 0.1)).toBe("≤ 135 Mo");
    expect(bracketLabel(fr.levy.tablet!, 16)).toBe("≤ 16 Go");
  });
  it("gives the declaration deadline", () => {
    expect(declarationDeadline("2026-10")).toBe("2026-11-20");
    expect(declarationDeadline("2026-12")).toBe("2027-01-20");
  });
});

describe("EPR fee per country", () => {
  it("uses the resale country's fee when set", () => {
    const c: CostSettings = { ...DEFAULT_COSTS, ecoFee: { phone: 0.5, tablet: 0.5, laptop: 1 }, countries: DEFAULT_COSTS.countries.map((x) => (x.code === "FI" ? { ...x, epr: { phone: 0.2 } } : x)) };
    expect(costBreakdown(c, route("FR", "FI"), phone(300), 100).items.eco).toBe(0.2);
    expect(costBreakdown(c, route("FR", "FR"), phone(300), 100).items.eco).toBe(0.5);
  });
});

describe("settings saved before country notes", () => {
  const old = DEFAULT_COSTS.countries.map(({ code, name, eu, vatPct, levy }) => ({ code, name, eu, vatPct, levy: code === "FR" ? levy : {} }));
  it("pick up the default notes and levies", () => {
    const n = normalizeCosts({ ...DEFAULT_COSTS, countries: old });
    expect(n.countries.find((c) => c.code === "NL")!.levy.phone).toEqual([{ upToGb: null, eur: 3.42 }]);
    expect(n.countries.find((c) => c.code === "FI")!.note).toMatch(/Pas de redevance/);
  });
  it("keep what the user entered and leave reviewed countries alone", () => {
    const mine = old.map((c) => (c.code === "BE" ? { ...c, levy: { phone: [{ upToGb: null, eur: 2.5 }] } } : c.code === "DE" ? { ...c, note: "" } : c));
    const n = normalizeCosts({ ...DEFAULT_COSTS, countries: mine });
    expect(n.countries.find((c) => c.code === "BE")!.levy).toMatchObject({ phone: [{ upToGb: null, eur: 2.5 }], tablet: [{ upToGb: null, eur: 4 }] });
    expect(n.countries.find((c) => c.code === "DE")!.levy).toEqual({});
  });
});

describe("channels and the EU marketplace", () => {
  const x = phone(400, "128GB", 0);
  const r = (sellTo: string, channel: "b2c" | "b2b", vatScheme: Route["vatScheme"], supplier: Route["supplier"] = "business"): Route => ({ buyFrom: "FR", sellTo, channel, vatScheme, supplier });

  it("B2B in France: VAT is neutral, the levy is still due, no marketplace commission", () => {
    const b = costBreakdown(DEFAULT_COSTS, r("FR", "b2b", "normal"), x, 200);
    expect(b.items.vat).toBeUndefined();
    expect(b.items.levy).toBe(8.4);
    expect(b.items.fees).toBe(12); // 3 % returns only, no 12 % commission
  });
  it("B2B to another EU country: exempt delivery, the buyer pays its own levy", () => {
    const b = costBreakdown(DEFAULT_COSTS, r("DE", "b2b", "normal"), x, 200);
    expect(b.items.vat).toBeUndefined();
    expect(b.items.levy).toBeUndefined();
  });
  it("B2C distance sale: the buyer's country levy and, under the normal scheme, its VAT", () => {
    const b = costBreakdown(DEFAULT_COSTS, r("DE", "b2c", "normal"), x, 200);
    expect(b.items.levy).toBe(6.25);
    expect(vatFor(DEFAULT_COSTS, r("DE", "b2c", "normal"))).toEqual({ pct: 19, country: "DE" });
    expect(vatFor(DEFAULT_COSTS, r("DE", "b2c", "margin"))).toEqual({ pct: 20, country: "FR" });
  });
  it("EU marketplace: costs are the average of the countries, weighted by the mix", () => {
    const c: CostSettings = { ...DEFAULT_COSTS, marketMix: { FR: 50, DE: 50 } };
    const b = costBreakdown(c, r(EU_MIX, "b2c", "margin"), x, 200);
    expect(b.items.levy).toBeCloseTo((8.4 + 6.25) / 2, 2);
    expect(b.items.outbound).toBeCloseTo((6.5 + 10) / 2, 2);
    expect(vatFor(c, r(EU_MIX, "b2c", "normal"))).toEqual({ pct: 19.5 });
    const buy = buyForNet(c, r(EU_MIX, "b2c", "normal"), x, 60);
    expect(netMargin(c, r(EU_MIX, "b2c", "normal"), x, buy)).toBeGreaterThanOrEqual(60);
  });
  it("lists the missing lanes of every marketplace country", () => {
    expect(missingLanes({ ...DEFAULT_COSTS, marketMix: { FR: 90, NO: 10 } }, r(EU_MIX, "b2c", "margin"))).toEqual(["FR→NO"]);
  });
  it("Copie France report counts the French share of marketplace lots", () => {
    const c: CostSettings = { ...DEFAULT_COSTS, marketMix: { FR: 60, DE: 40 } };
    const rep = levyReport(c, [{ date: "2026-10-01", ref: "L", source: "x", buyFrom: "FI", sellTo: EU_MIX, category: "phone", brand: "Apple", model: "iPhone 13", storage: "128GB", quantity: 10 }], "FR");
    expect(rep.lines[0]).toMatchObject({ share: 0.6, total: 50.4, note: "eu_mix" });
    expect(rep.summary[0].quantity).toBe(6);
  });
  it("explains the rules and flags a margin scheme on a lot bought with VAT", () => {
    const keys = (route: Route) => routeRules(DEFAULT_COSTS, route).map((x) => x.key);
    expect(keys({ ...r("FR", "b2c", "margin"), buyFrom: "FI" })).toEqual(expect.arrayContaining(["rule_buy_business_eu", "rule_warn_margin_not_allowed", "rule_vat_margin", "rule_levy_home"]));
    expect(keys(r("DE", "b2b", "normal"))).toEqual(expect.arrayContaining(["rule_vat_b2b_eu", "rule_levy_b2b_eu", "rule_b2b_prices"]));
    expect(keys(r(EU_MIX, "b2c", "normal", "consumer"))).toEqual(expect.arrayContaining(["rule_buy_consumer", "rule_warn_normal_costly", "rule_sell_marketplace", "rule_vat_oss_mix", "rule_levy_mix"]));
    expect(keys(r("CH", "b2c", "margin"))).toContain("rule_vat_export");
  });
});

describe("shipping defaults", () => {
  it("ship a lot by pallet and a consumer sale by parcel", () => {
    const b2c = costBreakdown(DEFAULT_COSTS, { buyFrom: "FR", sellTo: "DE", vatScheme: "margin", channel: "b2c" }, phone(300, "128GB", 40), 100);
    expect(b2c.items.inbound).toBe(1 + 3); // carton / palette FR 120 € sur 40
    expect(b2c.items.outbound).toBe(10);
    const b2b = costBreakdown(DEFAULT_COSTS, { buyFrom: "FR", sellTo: "DE", vatScheme: "normal", channel: "b2b" }, phone(300, "128GB", 40), 100);
    expect(b2b.items.outbound).toBe(1 + 6.25); // palette 250 € sur 40
  });
  it("a shop buyback (no lot size) only counts the per-device packing on the way in", () => {
    expect(costBreakdown(DEFAULT_COSTS, route("FR", "FR"), phone(300), 100).items.inbound).toBe(1);
  });
  it("cover every default country both ways", () => {
    for (const c of DEFAULT_COSTS.countries) {
      expect(missingLanes(DEFAULT_COSTS, { buyFrom: c.code, sellTo: c.code, vatScheme: "margin" })).toEqual([]);
    }
  });
  it("replace untouched old defaults and estimates, keep lanes edited by hand", () => {
    const old: Partial<CostSettings> = {
      ...DEFAULT_COSTS, lanesVersion: undefined,
      lanes: [
        { from: "FR", to: "FR", perUnit: { phone: 7.5, tablet: 9, laptop: 12 }, perShipment: 0, dutyPct: 0, clearanceEur: 0 },
        { from: "FI", to: "FR", perUnit: { phone: 1, tablet: 1.5, laptop: 3 }, perShipment: 300, dutyPct: 0, clearanceEur: 0 },
      ],
    };
    const n = normalizeCosts(old);
    expect(n.lanes.find((l) => l.from === "FR" && l.to === "FR")).toMatchObject({ perUnit: { phone: 6.5 }, estimate: true });
    expect(n.lanes.find((l) => l.from === "FI" && l.to === "FR")!.perShipment).toBe(300);
    expect(n.lanes.length).toBe(DEFAULT_COSTS.lanes.length);
    expect(n.lanesVersion).toBe(2);
    const again = normalizeCosts({ ...n, lanes: n.lanes.filter((l) => !(l.from === "FR" && l.to === "DE")) });
    expect(again.lanes.some((l) => l.from === "FR" && l.to === "DE")).toBe(false); // deleted on purpose: not re-added
  });
});

describe("pallets", () => {
  it("count the pallets a lot needs, by category", () => {
    expect(palletsFor(DEFAULT_COSTS, [{ category: "phone", quantity: 300 }])).toBe(1);
    expect(palletsFor(DEFAULT_COSTS, [{ category: "phone", quantity: 1200 }])).toBe(3);
    expect(palletsFor(DEFAULT_COSTS, [{ category: "laptop", quantity: 150 }, { category: "phone", quantity: 250 }])).toBe(2);
  });
  it("charge every pallet of a big lot", () => {
    const x = { ...phone(300, "128GB", 1200), lotPallets: 3 };
    const b = costBreakdown(DEFAULT_COSTS, route("FI", "FR"), x, 100);
    expect(b.items.inbound).toBe(1 + 1.2); // 3 × 480 € / 1 200
    expect(b.modes.inbound).toBe("pallet");
  });
  it("send a small far-away lot as parcels when cheaper, and sell to consumers by parcel", () => {
    const b = costBreakdown(DEFAULT_COSTS, route("FI", "FR"), phone(300, "128GB", 5), 100);
    expect(b.modes).toEqual({ inbound: "parcel", outbound: "parcel" });
    expect(b.items.inbound).toBe(14);
  });
  it("counts customs clearance only when the lot goes by pallet", () => {
    expect(costBreakdown(DEFAULT_COSTS, route("GB", "FR"), phone(300, "128GB", 3), 100).items.duty).toBeUndefined();
  });
});
