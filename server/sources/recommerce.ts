import { get, getSitemap } from "../http.ts";
import { titleMatch } from "../match.ts";
import type { Grade, Query, RawOffer, Source } from "../types.ts";

/**
 * Recommerce (FR) — refurbisher of phones and laptops. The sitemap lists one page per configuration
 * ("thinkpad-t480-14-2018-14-pouces-core-i5-1-7ghz-ram-8-go-256go-noir-azerty", "iphone-13-128go-bleu").
 * Each page's JSON-LD holds one Offer per condition; the condition is the SKU's second segment
 * ("2213-2:C:UD:BK"): AB = état parfait, C = très bon, D = bon, E = correct.
 */
const SKU_GRADE: Record<string, Grade> = { AB: "A", C: "B", D: "C", E: "D" };
const PAGES_PER_QUERY = 4;

const slugTitle = (url: string) => url.split("/").pop()!.replace(/-/g, " ");

export const recommerce: Source = {
  id: "recommerce",
  name: "Recommerce",
  country: "FR",
  site: "https://www.recommerce.com",
  kinds: ["resale"],
  categories: ["phone", "laptop"],
  async run(q: Query) {
    // Product pages sit directly under /fr/; category pages are under /fr/les-…
    const urls = (await getSitemap("https://www.recommerce.com/fr/sitemap.xml")).filter((u) => /\/fr\/(?!les-)[a-z0-9-]+$/.test(u));
    const model = { ...q, cpu: undefined, ram: undefined, storage: undefined };
    // Best-matching configurations first (capacity / CPU from the slug), one colour per configuration.
    const seen = new Set<string>();
    const candidates = urls
      .filter((u) => titleMatch(slugTitle(u), model) > 0)
      .map((u) => ({ u, s: titleMatch(slugTitle(u), q) }))
      .sort((a, b) => b.s - a.s)
      .filter(({ u }) => {
        const config = slugTitle(u).replace(/\s(noir|blanc|bleu|rouge|rose|vert|violet|gris|argent|or|jaune|minuit|lumiere stellaire|graphite|sierra|azerty|qwerty|qwertz)\b.*$/, "");
        if (seen.has(config)) return false;
        seen.add(config);
        return true;
      })
      .slice(0, PAGES_PER_QUERY);
    const offers: RawOffer[] = [];
    for (const { u } of candidates) {
      const html = await get(u);
      for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
        if (!m[1].includes("AggregateOffer")) continue;
        let product;
        try {
          product = JSON.parse(m[1]);
        } catch {
          continue;
        }
        for (const o of (product.offers?.offers ?? []) as { sku?: string; price?: string }[]) {
          const letter = o.sku?.split(":")[1] ?? "";
          const price = Number(o.price);
          if (!price) continue;
          offers.push({
            kind: "resale",
            // The slug carries the configuration ("… core i5 … ram 8 go 256go"), the name the model.
            title: `${product.name} | ${slugTitle(u)}`,
            price: Math.round(price * 100) / 100,
            currency: "EUR",
            url: u,
            condition: letter,
            grade: SKU_GRADE[letter],
          });
        }
      }
    }
    return offers;
  },
};
