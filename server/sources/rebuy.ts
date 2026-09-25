import { get, getSitemap } from "../http.ts";
import { titleMatch } from "../match.ts";
import type { Grade, Query, RawOffer, Source } from "../types.ts";

/**
 * rebuy — buys and resells used devices in several countries. Search pages are disallowed by robots.txt,
 * so products are found through the public sitemaps. Each product page embeds, per grade (A1 → A4),
 * the resale price and the price rebuy pays ("purchasePrice"), in cents.
 * rebuy trades phones and Apple computers only (no Windows laptops).
 */
const LABEL_GRADE: Record<string, Grade> = { A1: "A", A2: "B", A3: "C", A4: "D" };

type Country = { tld: string; code: string; phoneSitemap: string };
const COUNTRIES: Country[] = [
  { tld: "fr", code: "FR", phoneSitemap: "green_mobile-1" },
  { tld: "de", code: "DE", phoneSitemap: "green_handy-1" },
  { tld: "nl", code: "NL", phoneSitemap: "green_telefoons-1" },
  { tld: "es", code: "ES", phoneSitemap: "green_telefonos-moviles-libres-1" },
  { tld: "it", code: "IT", phoneSitemap: "green_smartphone-e-cellulari-1" },
];

async function productUrls(c: Country): Promise<string[]> {
  const [phones, apple] = await Promise.all([
    getSitemap(`https://www.rebuy.${c.tld}/${c.phoneSitemap}.xml.gz`),
    getSitemap(`https://www.rebuy.${c.tld}/green_apple-1.xml.gz`),
  ]);
  return [...phones, ...apple];
}

const slugTitle = (url: string) => decodeURIComponent(url.split("/").pop()!.replace(/_\d+$/, "")).replace(/-/g, " ");

type Variant = { price: number; purchasePrice: number; label: string; quantity: number };

function parseVariants(html: string): Variant[] {
  const i = html.indexOf('"productDetailViewDto"');
  if (i < 0) return [];
  const seg = html.slice(i, i + 20000);
  return [...seg.matchAll(/\{"quantity":(\d+),"fullBatteryQuantity":\d+,"price":(\d+),"purchasePrice":(\d+),[^}]*?"label":"(A\d)"\}/g)].map((m) => ({
    quantity: Number(m[1]),
    price: Number(m[2]) / 100,
    purchasePrice: Number(m[3]) / 100,
    label: m[4],
  }));
}

function rebuy(c: Country): Source {
  return {
    id: `rebuy-${c.tld}`,
    name: `rebuy ${c.code}`,
    country: c.code,
    site: `https://www.rebuy.${c.tld}`,
    kinds: ["buyback", "resale"],
    categories: ["phone", "laptop"],
    supports: (q) => q.category === "phone" || /apple|macbook/i.test(`${q.brand} ${q.model}`),
    async run(q) {
      const urls = await productUrls(c);
      // Same device in several colours: prices are near-identical, two pages are enough.
      const candidates = urls
        .map((url) => ({ url, score: titleMatch(slugTitle(url), q) }))
        .filter((x) => x.score > 0 && (!q.storage || x.score >= 0.85))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      const offers: RawOffer[] = [];
      for (const cand of candidates) {
        const title = slugTitle(cand.url);
        for (const v of parseVariants(await get(cand.url))) {
          const grade = LABEL_GRADE[v.label];
          if (v.purchasePrice > 0) offers.push({ kind: "buyback", title, price: v.purchasePrice, currency: "EUR", url: cand.url, condition: v.label, grade });
          if (v.price > 0) offers.push({ kind: "resale", title, price: v.price, currency: "EUR", url: cand.url, condition: v.label, grade });
        }
      }
      return offers;
    },
  };
}

export const REBUY: Source[] = COUNTRIES.map(rebuy);
