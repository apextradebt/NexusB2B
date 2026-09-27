import { get } from "../http.ts";
import { gradeOf } from "../match.ts";
import type { Query, RawOffer, Source } from "../types.ts";

/**
 * alternate.de — electronics retailer with a refurbished range ("Generalüberholt"), including older business
 * laptops and phones. Search result boxes carry the name, the configuration line, the condition and the price;
 * only boxes badged "Refurbished" are kept (new devices are not a resale reference).
 */
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/[®™�]/g, "").replace(/\s+/g, " ").trim();

export const alternate: Source = {
  id: "alternate",
  name: "alternate",
  country: "DE",
  site: "https://www.alternate.de",
  kinds: ["resale"],
  categories: ["phone", "laptop"],
  async run(q: Query) {
    const term = q.category === "laptop" ? `${q.brand} ${q.model}` : `${q.model} ${q.storage ?? ""}`.trim();
    const html = await get(`https://www.alternate.de/listing.xhtml?q=${encodeURIComponent(term)}`);
    const offers: RawOffer[] = [];
    for (const [, url, box] of html.matchAll(/<a href="(https:\/\/www\.alternate\.de\/[^"]+)" class="card[^"]*productBox[^"]*"[^>]*>(.*?)<\/a>/gs)) {
      if (!box.includes("badge-refurbished")) continue;
      const name = box.match(/class="product-name[^"]*">(.*?)<\/div>/s)?.[1]?.replace(/<[^>]+>/g, " ");
      const sub = box.match(/class="product-name-sub">([^<]*)/)?.[1] ?? "";
      const price = box.match(/class="price[^"]*">[^\d]*([\d.]+,\d{2})/)?.[1];
      if (!name || !price) continue;
      const cond = box.match(/refurbished-grading-body">([^<]+)/)?.[1]?.trim();
      offers.push({
        kind: "resale",
        // "Dell Latitude E7470 Generalüberholt, Notebook | schwarz, Intel Core i7-6600U, 8 GB DDR4, 256 GB (256 GB SSD)"
        title: `${decode(name)} | ${decode(sub)}`,
        price: Number(price.replace(/\./g, "").replace(",", ".")),
        currency: "EUR",
        url,
        condition: cond,
        grade: gradeOf(cond),
      });
    }
    return offers;
  },
};
