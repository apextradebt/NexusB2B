import { SourceError, get, getSitemap } from "../http.ts";
import { titleMatch } from "../match.ts";
import type { Grade, RawOffer, Source } from "../types.ts";

/**
 * US buyback comparison sites (BankMyCell: 16 buyers, SellCell: 40+). One page per phone model, found through
 * the sitemap; its JSON-LD has one AggregateOffer per condition, highPrice = best trade-in offer.
 * Prices are per model, not per capacity.
 */
type AggregateOffer = { category?: string; highPrice?: string; lowPrice?: string; offerCount?: number | string };

type Comparator = {
  id: string;
  name: string;
  site: string;
  sitemap: string;
  /** Model pages among the sitemap URLs. */
  isModelPage: (url: string) => boolean;
  conditions: Record<string, Grade>;
};

function comparator(c: Comparator): Source {
  return {
    id: c.id,
    name: c.name,
    country: "US",
    site: c.site,
    kinds: ["buyback"],
    categories: ["phone"],
    async run(q) {
      const urls = (await getSitemap(c.sitemap)).filter(c.isModelPage);
      const model = { ...q, storage: undefined };
      const slugTitle = (u: string) => u.replace(/\/$/, "").split("/").pop()!.replace(/-/g, " ");
      const best = urls
        .map((u) => ({ u, s: titleMatch(slugTitle(u), model) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.u.length - b.u.length)[0];
      if (!best) return [];
      const html = await get(best.u);
      const product = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)]
        .map((m) => {
          try {
            return JSON.parse(m[1]);
          } catch {
            return undefined;
          }
        })
        .find((d) => d?.["@type"] === "Product");
      const offers: RawOffer[] = [];
      for (const o of (product?.offers ?? []) as AggregateOffer[]) {
        const label = o.category?.replace(/^Condition > /, "") ?? "";
        const grade = c.conditions[label];
        if (!grade || !Number(o.highPrice)) continue;
        offers.push({
          kind: "buyback",
          title: String(product.name).replace(/^Sell /, `${q.brand} `),
          price: Number(o.highPrice),
          currency: "USD",
          url: best.u,
          condition: label,
          grade,
          note: `Meilleure des ${o.offerCount} offres de rachat US, toutes capacités (minimum $${o.lowPrice})`,
        });
      }
      return offers;
    },
  };
}

export const bankmycell = comparator({
  id: "bankmycell",
  name: "BankMyCell",
  site: "https://www.bankmycell.com",
  sitemap: "https://www.bankmycell.com/sitemap.xml",
  isModelPage: (u) => /\/sell\/[a-z0-9-]+$/.test(u) && !u.includes("/sell/cell-phones"),
  conditions: { Flawless: "A", Good: "C", Cracked: "E", Faulty: "E" },
});

export const sellcell = comparator({
  id: "sellcell",
  name: "SellCell",
  site: "https://www.sellcell.com",
  sitemap: "https://www.sellcell.com/sitemap.xml",
  isModelPage: (u) => /\/phones\/[a-z0-9-]+\/$/.test(u),
  conditions: { Mint: "A", Good: "C", Poor: "D", Broken: "E", Faulty: "E" },
});

/**
 * Envirofone (UK buyer). One page per phone model in the sitemap ("/en-gb/sell/honor/honor-200/trade");
 * its JSON-LD AggregateOffer gives the range of Envirofone's offers: highPrice = best condition, largest capacity.
 */
export const envirofone: Source = {
  id: "envirofone",
  name: "Envirofone",
  country: "UK",
  site: "https://www.envirofone.com",
  kinds: ["buyback"],
  categories: ["phone"],
  async run(q) {
    const urls = (await getSitemap("https://www.envirofone.com/sitemap.xml")).filter((u) => /\/en-gb\/sell\/[^/]+\/[^/]+\/trade$/.test(u));
    // "/sell/honor/400-pro/trade" → "honor 400 pro": brand segment + model segment.
    const slugTitle = (u: string) => u.split("/").slice(-3, -1).join(" ").replace(/-/g, " ");
    const model = { ...q, storage: undefined };
    const best = urls
      .map((u) => ({ u, s: titleMatch(slugTitle(u), model) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.u.length - b.u.length)[0];
    if (!best) return [];
    const html = await get(best.u);
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
      let data;
      try {
        data = JSON.parse(m[1]);
      } catch {
        continue;
      }
      const product = (data["@graph"] ?? [data]).find((g: { "@type"?: string }) => g["@type"] === "Product");
      const agg = product?.offers;
      if (!agg?.highPrice) continue;
      return [{
        kind: "buyback" as const,
        title: `${product.brand?.name ?? q.brand} ${product.name}`,
        price: Number(agg.highPrice),
        currency: "GBP" as const,
        url: best.u,
        condition: "Offre maximale",
        grade: "A" as const,
        note: `Offre maximale Envirofone (meilleur état, plus grande capacité) — minimum £${agg.lowPrice}`,
      }];
    }
    return [];
  },
};

/**
 * O2 Recycle (UK, run by Likewize). Brand pages ("/sell-your-honor-device") link one page per model
 * ("/sell-your-honor-200"), which states the best offer: "Sell Honor 200 up to £45.00".
 */
export const o2recycle: Source = {
  id: "o2recycle",
  name: "O2 Recycle",
  country: "UK",
  site: "https://www.o2recycle.co.uk",
  kinds: ["buyback"],
  categories: ["phone"],
  async run(q) {
    const brand = q.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let listing: string;
    try {
      listing = await get(`https://www.o2recycle.co.uk/sell-your-${brand}-device`);
    } catch (e) {
      // No page for this brand: O2 Recycle does not buy it.
      if (e instanceof SourceError && e.message === "HTTP 404") return [];
      throw e;
    }
    const paths = [...new Set([...listing.matchAll(/href="(\/sell-your-[a-z0-9-]+)"/g)].map((m) => m[1]))].filter((p) => !p.endsWith("-device"));
    const slugTitle = (p: string) => p.replace("/sell-your-", "").replace(/-/g, " ");
    const best = paths
      .map((p) => ({ p, s: titleMatch(slugTitle(p), { ...q, storage: undefined }) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.length - b.p.length)[0];
    if (!best) return [];
    const url = `https://www.o2recycle.co.uk${best.p}`;
    const text = (await get(url)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // "Sell Samsung Galaxy Z Fold6 up to £323.00" — not the other "up to £" on the page (postage insurance).
    const brandRe = q.brand.replace(/[^a-z0-9]/gi, ".");
    const m = text.match(new RegExp(`Sell ${brandRe}[^£]{0,80}? up to £\\s?([\\d,.]+)`, "i"));
    if (!m) return [];
    return [{
      kind: "buyback" as const,
      title: `${q.brand} ${slugTitle(best.p)}`,
      price: Number(m[1].replace(/,/g, "")),
      currency: "GBP" as const,
      url,
      condition: "Offre maximale",
      grade: "A" as const,
      note: "Offre maximale O2 Recycle (meilleur état, plus grande capacité)",
    }];
  },
};
