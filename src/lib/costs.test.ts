import { describe, expect, it } from "vitest";
import { buyForNet, costBreakdown, DEFAULT_COSTS, levyFor, netMargin, normalizeCosts, storageGb, vatFor, type CostInput, type CostSettings, type Route } from "@/lib/costs";

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
    expect(b.items.inbound).toBe(1 + 3.5); // 1 €/u. + 350 € / 100 u.
    expect(b.items.outbound).toBe(7.5);
    expect(b.missingLanes).toEqual([]);
  });
  it("reports a missing lane instead of guessing", () => {
    expect(costBreakdown(bare, route("PL", "FR"), phone(300), 100).missingLanes).toEqual(["PL→FR"]);
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
