import { describe, expect, it } from "vitest";
import { buyGap, costSplit, marketGap, marketVerdict } from "@/lib/pricing";
import type { CostBreakdown } from "@/lib/costs";
import type { QuoteLine } from "@/types";

const line = (p: Partial<QuoteLine>) => p as QuoteLine;

describe("market comparison", () => {
  it("flags a price from 15 % away from the market, either way", () => {
    expect(marketVerdict(0.18)).toBe("high");
    expect(marketVerdict(0.15)).toBe("high");
    expect(marketVerdict(-0.15)).toBe("low");
    expect(marketVerdict(-0.4)).toBe("low");
    expect(marketVerdict(0.14)).toBe("ok");
    expect(marketVerdict(-0.04)).toBe("ok");
  });

  it("agrees with the percentage shown", () => {
    expect(marketVerdict(0.146)).toBe("high"); // shown as 15 %
    expect(marketVerdict(0.144)).toBe("ok"); // shown as 14 %
  });

  it("compares our buy price with buyback sites", () => {
    expect(buyGap(line({ buyPrice: 116, marketBuy: 121 }))).toBeCloseTo(-0.041, 3);
    expect(buyGap(line({ buyPrice: 116 }))).toBeUndefined();
    expect(buyGap(line({ marketBuy: 121 }))).toBeUndefined();
  });

  it("has nothing to say about a resale price taken from the market itself", () => {
    expect(marketGap(line({ sellPrice: 200, marketSell: 200 }))).toBeUndefined();
  });
});

describe("costSplit", () => {
  it("separates taxes from the rest and adds up to the rounded total", () => {
    const costs: CostBreakdown = {
      items: { refurb: 15, inbound: 1.46, outbound: 7.5, levy: 7.8, vat: 42.5 },
      modes: {},
      total: 74.26,
      missingLanes: [],
    };
    expect(costSplit(costs)).toEqual({ taxes: 50, other: 24 });
  });
});
