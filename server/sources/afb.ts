import { get, getSitemap } from "../http.ts";
import { titleMatch } from "../match.ts";
import type { Grade, Query, RawOffer, Source } from "../types.ts";

/**
 * AfB — large refurbisher of ex-corporate laptops (Latitude, EliteBook, ThinkPad…). Search URLs are
 * disallowed by robots.txt (`Disallow: /*?`), so products are found through the sitemap: one page per
 * configuration and grade, slug = model ("hp-elitebook-840-g6/de-33.202-b"). Each page's <title> carries
 * the configuration and its JSON-LD the price of that exact SKU.
 * AfB grades A / B / C ("kaum / leichte / deutliche Gebrauchsspuren") map to our B / C / D.
 */
const AFB_GRADE: Record<string, Grade> = { a: "B", b: "C", c: "D" };
const ORDER: Grade[] = ["A", "B", "C", "D", "E"];
const PAGES_PER_QUERY = 6;

type Shop = { tld: string; country: string };

const slugTitle = (url: string) => new URL(url).pathname.split("/")[1].replace(/-/g, " ");
const slugGrade = (url: string) => AFB_GRADE[url.match(/-([abc])\/?$/)?.[1] ?? ""];

async function productUrls(shop: Shop): Promise<string[]> {
  const index = await getSitemap(`https://www.afbshop.${shop.tld}/sitemap.xml`);
  const parts = await Promise.all(index.filter((u) => u.endsWith(".xml.gz") || u.endsWith(".xml")).map((u) => getSitemap(u)));
  // Product pages end in a SKU segment ("/de-33.202-b/", "/fr-36917-b/").
  return parts.flat().filter((u) => /\/[a-z]{2}-[\d.]+-[abc]\/?$/.test(u));
}

function afb(shop: Shop): Source {
  return {
    id: `afb-${shop.tld}`,
    name: `AfB ${shop.country}`,
    country: shop.country,
    site: `https://www.afbshop.${shop.tld}`,
    kinds: ["resale"],
    categories: ["laptop"],
    async run(q) {
      const model: Query = { ...q, cpu: undefined, ram: undefined, storage: undefined };
      const want = ORDER.indexOf(q.grade);
      // Same model, closest grade first; the configuration is checked on each page's title by the engine.
      const candidates = (await productUrls(shop))
        .filter((u) => titleMatch(slugTitle(u), model) > 0)
        .sort((a, b) => Math.abs(ORDER.indexOf(slugGrade(a) ?? "C") - want) - Math.abs(ORDER.indexOf(slugGrade(b) ?? "C") - want))
        .slice(0, PAGES_PER_QUERY);
      const offers: RawOffer[] = [];
      for (const url of candidates) {
        const html = await get(url);
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim();
        const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
        if (!title || !ld) continue;
        let price: number | undefined;
        try {
          const group = [JSON.parse(ld)].flat()[0];
          price = Number([group.offers].flat()[0]?.price);
        } catch {
          continue;
        }
        if (!price) continue;
        const grade = slugGrade(url);
        offers.push({ kind: "resale", title, price, currency: "EUR", url, condition: `AfB ${url.match(/-([abc])\/?$/)?.[1]?.toUpperCase()}`, grade });
      }
      return offers;
    },
  };
}

export const AFB: Source[] = [afb({ tld: "de", country: "DE" }), afb({ tld: "fr", country: "FR" })];
