import { get, getJson, getSitemap } from "../http.ts";
import { gradeOf, norm, titleMatch } from "../match.ts";
import type { Grade, Query, RawOffer, Source } from "../types.ts";

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Search on the model family ("ThinkPad T14"); generation, CPU and capacity are checked on the results. */
export const baseModel = (q: Query) =>
  (q.category === "laptop" ? `${q.brand} ${q.model}` : q.model).replace(/\b(gen(eration)?\.?\s*\d+|g\d+)\b/gi, "").replace(/\s+/g, " ").trim();

const cpuTierClash = (title: string, q: Query) => {
  const want = q.cpu?.match(/\b(i[3579]|ryzen [3579])/i)?.[1]?.toLowerCase();
  const have = norm(title).match(/\b(i[3579]|ryzen [3579])\b/)?.[1];
  return !!want && !!have && want !== have;
};

/* ------------------------------------------------------------------ greenpanda (DE, resale) */
// Search page embeds window.ga4Product: name + variant ("Qualität Sehr gut - CPU Modell Core i5 10310U - Speicher 16GB RAM - … 256GB") + gross price.
export const greenpanda: Source = {
  id: "greenpanda",
  name: "greenpanda",
  country: "DE",
  site: "https://greenpanda.de",
  kinds: ["resale"],
  categories: ["phone", "laptop"],
  async run(q) {
    const term = baseModel(q);
    const html = await get(`https://greenpanda.de/search?search=${encodeURIComponent(term)}`);
    const m = html.match(/window\.ga4Product\s*=\s*(\{.*?\});\s*<\/script>/s) || html.match(/window\.ga4Product\s*=\s*(\{.*?\});/s);
    if (!m) return [];
    const items = Object.values(JSON.parse(m[1]) as Record<string, { item_id: string; item_name: string; item_variant: string; price: number }>);
    const links = new Map<string, string>();
    for (const l of html.matchAll(/href="(https:\/\/greenpanda\.de\/[^"]+\/([a-z0-9-]+))"/gi)) links.set(l[2].toUpperCase(), l[1]);
    return items.map((it) => {
      const quality = it.item_variant.match(/Qualität ([^-]+)/)?.[1]?.trim();
      const variant = it.item_variant.replace(/Qualität [^-]+-/, "").replace(/CPU Modell Core /, "").replace(/Festplatte 1 Kapazität /, "");
      return {
        kind: "resale" as const,
        title: `${it.item_name} ${variant}`,
        price: it.price,
        currency: "EUR" as const,
        url: links.get(it.item_id) ?? `https://greenpanda.de/search?search=${encodeURIComponent(term)}`,
        condition: quality,
        grade: gradeOf(quality),
      };
    });
  },
};

/* ------------------------------------------------------------------ certideal (FR, resale, phones) */
// The site's own public search (Algolia, search-only key published in the page for browsers).
let certidealKeys: { app: string; key: string; index: string; at: number } | null = null;
export const certideal: Source = {
  id: "certideal",
  name: "Certideal",
  country: "FR",
  site: "https://certideal.com",
  kinds: ["resale"],
  categories: ["phone"],
  async run(q) {
    if (!certidealKeys || Date.now() - certidealKeys.at > 24 * 3600 * 1000) {
      const home = await get("https://certideal.com/");
      const v = (n: string) => home.match(new RegExp(`var ${n}='([^']+)'`))?.[1];
      const app = v("algoliaAppID"), key = v("algoliaAPIKeySearch"), index = v("algoliaIndexName");
      if (!app || !key || !index) return [];
      certidealKeys = { app, key, index, at: Date.now() };
    }
    const { app, key, index } = certidealKeys;
    const data = await getJson<{ hits: { name: string; price: number; url: string; state?: string; capacity?: string }[] }>(
      `https://${app}-dsn.algolia.net/1/indexes/${index}/query`,
      {
        method: "POST",
        headers: { "X-Algolia-Application-Id": app, "X-Algolia-API-Key": key, "Content-Type": "application/json" },
        // Capacity is filtered afterwards: the index stores it as "128 Go" and a "128GB" query returns nothing.
        body: JSON.stringify({ params: `query=${encodeURIComponent(q.model)}&hitsPerPage=100` }),
      }
    );
    return data.hits.map((h) => ({
      kind: "resale" as const,
      title: `${h.name} ${h.capacity ?? ""}`,
      price: h.price,
      currency: "EUR" as const,
      url: h.url,
      condition: h.state,
      grade: gradeOf(h.state),
    }));
  },
};

/* ------------------------------------------------------------------ itjustgood (FR, resale, laptops) */
export const itjustgood: Source = {
  id: "itjustgood",
  name: "ITJustGood",
  country: "FR",
  site: "https://www.itjustgood.com",
  kinds: ["resale"],
  categories: ["laptop"],
  async run(q) {
    const html = await get(`https://www.itjustgood.com/catalogsearch/result/?q=${encodeURIComponent(baseModel(q))}`);
    const offers: RawOffer[] = [];
    for (const block of html.split("product-item-info").slice(1)) {
      const link = block.match(/class="product-item-link"[^>]*href="([^"]+)"[^>]*>\s*([^<]+)/);
      const price = block.match(/data-price-amount="([\d.]+)"[^>]*data-price-type="finalPrice"/);
      if (!link || !price) continue;
      const name = decode(link[2]);
      // The URL slug carries the configuration (cpu / ram / ssd), the name carries the condition.
      const slug = link[1].split("/").pop()!.replace(/\.html$/, "").replace(/-/g, " ");
      const cond = name.match(/(Comme neuf|Très bon état|Bon état|État correct)/i)?.[1];
      offers.push({ kind: "resale", title: `${name} ${slug}`, price: Math.round(Number(price[1]) * 100) / 100, currency: "EUR", url: link[1], condition: cond, grade: gradeOf(cond) });
    }
    return offers;
  },
};

/* ------------------------------------------------------------------ SellBroke (US, buyback) */
// Laptop model pages come from the sitemap; phones from the brand listing. Each model page states
// "Prices by condition: Flawless: $71, Good: $60, Broken/Defects: $49".
const COND_GRADE: [RegExp, Grade][] = [[/flawless|like new|excellent/i, "A"], [/good/i, "C"], [/fair/i, "D"], [/broken|defect/i, "E"]];
async function sellbrokeModelOffers(url: string): Promise<RawOffer[]> {
  const html = await get(url);
  const title = decode(html.match(/<title>Sell (.*?) —/)?.[1] ?? "");
  const line = html.match(/Prices by condition: ([^"]+?)\.\s*All prices/)?.[1];
  if (!line) return [];
  return [...line.matchAll(/([A-Za-z/ ]+): \$([\d,]+)/g)].map((m) => {
    const label = m[1].trim();
    return {
      kind: "buyback" as const,
      title,
      price: Number(m[2].replace(/,/g, "")),
      currency: "USD" as const,
      url,
      condition: label,
      grade: COND_GRADE.find(([re]) => re.test(label))?.[1],
    };
  });
}
export const sellbroke: Source = {
  id: "sellbroke",
  name: "SellBroke",
  country: "US",
  site: "https://sellbroke.com",
  kinds: ["buyback"],
  categories: ["laptop"],
  async run(q) {
    let urls: string[];
    if (q.category === "laptop") {
      // Windows laptops live under /sell/laptop/, MacBooks under /sell/macbook/.
      urls = (await getSitemap("https://sellbroke.com/sitemap.xml")).filter((u) => u.includes("/sell/laptop/") || u.includes("/sell/macbook/"));
    } else {
      const brand = q.brand.toLowerCase().replace(/\s+/g, "-");
      const html = await get(`https://sellbroke.com/sell/phone/${brand}/`);
      urls = [...new Set([...html.matchAll(/href="(\/sell\/phone\/[^"]+\/[^"]+\/)"/g)].map((m) => `https://sellbroke.com${m[1]}`))];
    }
    const slugTitle = (u: string) => u.split("/").filter(Boolean).pop()!.replace(/-/g, " ");
    const best = urls
      .map((u) => ({ u, s: titleMatch(slugTitle(u), q) }))
      .filter((x) => x.s > 0 && !cpuTierClash(slugTitle(x.u), q) && !/rugged/.test(x.u) === !/rugged/i.test(q.model))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    const out: RawOffer[] = [];
    for (const b of best) out.push(...(await sellbrokeModelOffers(b.u)));
    return out;
  },
};

/* ------------------------------------------------------------------ Compare and Recycle (UK, buyback comparison) */
// Model pages publish an AggregateOffer across all UK buyers: highest price = best buyback offer on the UK market.
export const compareandrecycle: Source = {
  id: "compareandrecycle",
  name: "Compare and Recycle",
  country: "UK",
  site: "https://www.compareandrecycle.co.uk",
  kinds: ["buyback"],
  categories: ["phone"],
  async run(q) {
    const slug = `${q.brand} ${q.model}`.toLowerCase().replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const path = `/mobile-phones/${slug}${q.storage ? "-" + q.storage.toLowerCase() : ""}`;
    let html: string;
    try {
      html = await get(`https://www.compareandrecycle.co.uk${path}`);
    } catch {
      html = await get(`https://www.compareandrecycle.co.uk/mobile-phones/${slug}`);
    }
    const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const product = ld.find((d) => d["@type"] === "Product");
    const agg = product?.offers;
    if (!agg?.highPrice) return [];
    return [{
      kind: "buyback" as const,
      title: product.name,
      price: Number(agg.highPrice),
      currency: "GBP" as const,
      url: `https://www.compareandrecycle.co.uk${path}`,
      condition: "Meilleure offre",
      grade: "A" as const,
      note: `Meilleure des ${agg.offerCount} offres de rachat UK (minimum £${agg.lowPrice})`,
    }];
  },
};
