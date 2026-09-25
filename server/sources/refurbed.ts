import { get } from "../http.ts";
import { gradeOf } from "../match.ts";
import { baseModel } from "./others.ts";
import type { Query, RawOffer, Source } from "../types.ts";

/**
 * refurbed — refurbished marketplace, one storefront per country (prices differ per market).
 * The search page embeds a GA4 product list: name + full variant ("i5-1145G7 | 14" | 16 GB | 256 GB SSD | … | Grade B") + price.
 */
function searchText(q: Query) {
  // Laptops: search the model family ("Lenovo ThinkPad T14") and let the matcher check generation / CPU / SSD.
  if (q.category === "laptop") return baseModel(q);
  return [q.model, q.storage].filter(Boolean).join(" ");
}

function refurbed(tld: string, country: string): Source {
  return {
    id: `refurbed-${tld}`,
    name: `refurbed ${country}`,
    country,
    site: `https://www.refurbed.${tld}`,
    kinds: ["resale"],
    categories: ["phone", "laptop"],
    async run(q) {
      const html = await get(`https://www.refurbed.${tld}/search/?query=${encodeURIComponent(searchText(q))}`);
      const m = html.match(/var GAData = JSON\.parse\("(.*?)"\);/s);
      if (!m) return [];
      const data = JSON.parse(JSON.parse(`"${m[1]}"`)) as {
        ecommerce: { items: { item_name: string; item_variant: string; price: string; currency: string; instance_id: string }[] };
      };
      const links = new Map<string, string>();
      for (const l of html.matchAll(/href="(\/p\/[^"]+?\/(\d+)[a-z]?\/)"/g)) links.set(l[2], l[1]);
      return data.ecommerce.items
        .filter((it) => it.currency === "EUR")
        .map((it): RawOffer => {
          const cond = it.item_variant.match(/Grade [A-D]/)?.[0];
          return {
            kind: "resale",
            title: `${it.item_name} ${it.item_variant.replace(/\s*\(\d+\)$/, "")}`,
            price: Number(it.price),
            currency: "EUR",
            url: `https://www.refurbed.${tld}${links.get(it.instance_id) ?? "/search/?query=" + encodeURIComponent(searchText(q))}`,
            condition: cond,
            grade: gradeOf(cond),
          };
        });
    },
  };
}

// Euro storefronts only (CHF/SEK/PLN/DKK/CZK markets are left out to keep prices comparable).
export const REFURBED: Source[] = [
  refurbed("fr", "FR"),
  refurbed("de", "DE"),
  refurbed("at", "AT"),
  refurbed("it", "IT"),
  refurbed("nl", "NL"),
  refurbed("es", "ES"),
  refurbed("be", "BE"),
];
