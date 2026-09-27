import { get } from "../http.ts";
import type { Query, RawOffer, Source } from "../types.ts";

/**
 * Classifieds — private sellers' asking prices. They cover old or rare devices no refurbisher stocks any more,
 * but they are lower and noisier than refurbished resale prices, so the engine only uses them when no
 * professional source found the device (`fallback`), and flags them as indicative.
 */

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Ads that are not a working device: broken units, parts, wanted ads, bulk lots. */
const JUNK = /\b(defekt|defect|kapot|bastler|ersatzteile?|onderdelen|for parts|suche|gezocht|zoeke?|ankauf|konvolut|partij)\b/i;

/** An accessory named before the device ("Premium Battery Dell Latitude E7470", "Netzteil für iPhone 13") is not the device. */
const ACCESSORY = /\b(battery|akku|accu|batterij|netzteil|ladeger(a|ä)t|oplader|lader|charger|adapter|tastatur|keyboard|toetsenbord|display|scherm|bildschirm|screen|h(u|ü)lle|hoesje|case|cover|panzerglas|dock(ing)?)\b/i;
function isAccessory(title: string, q: Query) {
  const first = q.model.split(/\s+/)[0].toLowerCase();
  const at = title.toLowerCase().indexOf(first);
  return at > 0 && ACCESSORY.test(title.slice(0, at));
}

const searchTerm = (q: Query) => (q.category === "laptop" ? `${q.brand} ${q.model}` : q.model);

/** Drop asking prices far below the rest (parts sold as "device", placeholder prices like 1 €). `min` is in the ads' currency. */
function saneOffers(offers: RawOffer[], min = 20): RawOffer[] {
  if (offers.length < 3) return offers.filter((o) => o.price >= min);
  const sorted = offers.map((o) => o.price).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return offers.filter((o) => o.price >= Math.max(min, median * 0.4) && o.price <= median * 2.5);
}

const note = "Annonces de particuliers (prix demandé) — indicatif, utilisé faute d'offre professionnelle";

/* ------------------------------------------------------------------ Kleinanzeigen (DE) */
// Search result pages list ~25 ads: title, short description and asking price ("140 € VB" = negotiable).
const KA_CATEGORY = { laptop: "s-notebooks", phone: "s-handy-telekom" } as const;
const KA_CODE = { laptop: "c278", phone: "c173" } as const;
export const kleinanzeigen: Source = {
  id: "kleinanzeigen",
  name: "Kleinanzeigen",
  country: "DE",
  site: "https://www.kleinanzeigen.de",
  kinds: ["resale"],
  categories: ["phone", "laptop"],
  fallback: true,
  async run(q) {
    const slug = searchTerm(q).toLowerCase().replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const url = `https://www.kleinanzeigen.de/${KA_CATEGORY[q.category]}/${slug}/k0${KA_CODE[q.category]}`;
    const html = await get(url);
    const offers: RawOffer[] = [];
    for (const [, href, body] of html.matchAll(/<article[^>]*data-href="([^"]+)"(.*?)<\/article>/gs)) {
      const title = body.match(/<h3[^>]*>\s*<a[^>]*>([^<]+)/)?.[1];
      const desc = body.match(/<p class="mb-xsmall[^"]*">([^<]*)/)?.[1] ?? "";
      const priceText = body.match(/text-title3 font-strong[^"]*">([^<]+)/)?.[1];
      const price = Number(priceText?.replace(/\./g, "").match(/(\d+)/)?.[1]);
      if (!title || !price || JUNK.test(title) || isAccessory(decode(title), q)) continue;
      offers.push({
        kind: "resale",
        // Description after " | " so only the ad title counts as the product name.
        title: `${decode(title)} | ${decode(desc)}`,
        price,
        currency: "EUR",
        url: `https://www.kleinanzeigen.de${href}`,
        condition: /\bVB\b/.test(priceText ?? "") ? "Annonce (négociable)" : "Annonce",
        note,
      });
    }
    return saneOffers(offers);
  },
};

/* ------------------------------------------------------------------ Marktplaats (NL) / 2dehands (BE) */
// Same platform: search pages embed the result list as JSON (__NEXT_DATA__): title, description, price in cents and condition.
type MpListing = {
  itemId: string;
  title: string;
  description?: string;
  priceInfo?: { priceCents?: number; priceType?: string };
  vipUrl?: string;
  attributes?: { key: string; value: string }[];
};
function adevinta(id: string, name: string, country: string, host: string): Source {
  return {
    id,
    name,
    country,
    site: `https://${host}`,
    kinds: ["resale"],
    categories: ["phone", "laptop"],
    fallback: true,
    async run(q) {
      const term = searchTerm(q).toLowerCase().replace(/\+/g, " plus");
      const html = await get(`https://${host}/q/${encodeURIComponent(term).replace(/%20/g, "+")}/`);
      const data = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)?.[1];
      if (!data) return [];
      const listings = (JSON.parse(data)?.props?.pageProps?.searchRequestAndResponse?.listings ?? []) as MpListing[];
      const offers: RawOffer[] = [];
      for (const l of listings) {
        const cents = l.priceInfo?.priceCents ?? 0;
        // "FIXED" and "MIN_BID" carry a real amount; "SEE_DESCRIPTION", "RESERVED", "FAST_BID" do not.
        if (!cents || !/FIXED|MIN_BID|NEGOTIABLE/.test(l.priceInfo?.priceType ?? "") || JUNK.test(l.title) || isAccessory(l.title, q)) continue;
        const condition = l.attributes?.find((a) => a.key === "condition")?.value;
        // Used devices only: "Nieuw" ads are shops selling new stock, "Niet werkend" are broken.
        if (condition && /^nieuw$|niet werkend|defect|onderdelen/i.test(condition)) continue;
        offers.push({
          kind: "resale",
          title: `${l.title} | ${l.description ?? ""}`,
          price: cents / 100,
          currency: "EUR",
          url: `https://${host}${l.vipUrl ?? `/v/${l.itemId}`}`,
          condition: condition ? `Annonce · ${condition}` : "Annonce",
          note,
        });
      }
      return saneOffers(offers);
    },
  };
}
export const marktplaats = adevinta("marktplaats", "Marktplaats", "NL", "www.marktplaats.nl");
export const tweedehands = adevinta("2dehands", "2dehands", "BE", "www.2dehands.be");

/* ------------------------------------------------------------------ Blocket (SE) / DBA (DK) / FINN (NO) / Tori (FI) */
// Same platform: the search page's JSON-LD is an ItemList of Products (name, description, price, currency, condition, url).
type VendItem = { name?: string; description?: string; url?: string; offers?: { price?: string; priceCurrency?: string; itemCondition?: string } };
function vend(id: string, name: string, country: string, host: string): Source {
  return {
    id,
    name,
    country,
    site: `https://${host}`,
    kinds: ["resale"],
    categories: ["phone", "laptop"],
    fallback: true,
    async run(q) {
      const html = await get(`https://${host}/recommerce/forsale/search?q=${encodeURIComponent(searchTerm(q)).replace(/%20/g, "+")}`);
      const page = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)]
        .map((m) => {
          try {
            return JSON.parse(m[1]);
          } catch {
            return undefined;
          }
        })
        .find((d) => d?.["@type"] === "CollectionPage");
      const items = ((page?.mainEntity?.itemListElement ?? []) as { item?: VendItem }[]).map((e) => e.item).filter(Boolean) as VendItem[];
      const offers: RawOffer[] = [];
      for (const it of items) {
        const price = Number(it.offers?.price);
        const currency = it.offers?.priceCurrency as RawOffer["currency"] | undefined;
        if (!it.name || !price || !currency || !it.url) continue;
        // Used devices only.
        if (/NewCondition|DamagedCondition/.test(it.offers?.itemCondition ?? "") || JUNK.test(it.name) || isAccessory(it.name, q)) continue;
        offers.push({ kind: "resale", title: `${decode(it.name)} | ${decode(it.description ?? "")}`, price, currency, url: it.url, condition: "Annonce", note });
      }
      // Kronor: about 10 to the euro.
      return saneOffers(offers, offers[0]?.currency === "EUR" ? 20 : 200);
    },
  };
}
export const blocket = vend("blocket", "Blocket", "SE", "www.blocket.se");
export const dba = vend("dba", "DBA", "DK", "www.dba.dk");
export const finn = vend("finn", "FINN", "NO", "www.finn.no");
export const tori = vend("tori", "Tori", "FI", "www.tori.fi");
