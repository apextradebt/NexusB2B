import phonesData from "@/data/phones.json";
import laptopsData from "@/data/laptops.json";
import type { Category, RefModel } from "@/types";

import laptopsExtra from "@/data/laptops-extra.json";
import phonesExtra from "@/data/phones-extra.json";
import tradeInDevices from "@/data/tradein-devices.json";

type PhoneJson = { brands: { name: string; models: { model: string; basePrice: number }[] }[] };
type LaptopJson = { models: Omit<RefModel, "category">[] };
type PhoneExtraJson = { phones: { brand: string; model: string; year: number; storage: string[] }[] };

// "+" must survive: "Galaxy S21" and "Galaxy S21+" are different phones.
const slug = (s: string) => s.toUpperCase().replace(/\+/g, "PLUS").replace(/[^A-Z0-9]/g, "");

const extraPhones = (phonesExtra as PhoneExtraJson).phones;
const extraByKey = new Map(extraPhones.map((p) => [`${p.brand}::${p.model}`, p]));

// Names suppliers give phones that the catalogue names by year ("iPhone SE 2nd Gen" is the "iPhone SE (2020)").
const PHONE_ALIASES: Record<string, string[]> = {
  "Apple::iPhone SE (2020)": ["iPhone SE 2nd Gen", "iPhone SE 2"],
  "Apple::iPhone SE (2022)": ["iPhone SE 3rd Gen", "iPhone SE 3"],
};

// Phones with a B2C reference price, enriched with their storage options…
const pricedPhones: RefModel[] = (phonesData as PhoneJson).brands.flatMap((b) =>
  b.models.map((m) => ({
    id: slug(`${b.name}${m.model}`),
    category: "phone" as const,
    brand: b.name,
    model: m.model,
    basePrice: m.basePrice,
    storage: extraByKey.get(`${b.name}::${m.model}`)?.storage,
    year: extraByKey.get(`${b.name}::${m.model}`)?.year,
    aliases: PHONE_ALIASES[`${b.name}::${m.model}`],
  }))
);
// …plus the B2B-only phones (priced by the agents only).
const pricedIds = new Set(pricedPhones.map((p) => p.id));
const extraOnly: RefModel[] = extraPhones
  .map((p) => ({ id: slug(`${p.brand}${p.model}`), category: "phone" as const, brand: p.brand, model: p.model, storage: p.storage, year: p.year, aliases: PHONE_ALIASES[`${p.brand}::${p.model}`] }))
  .filter((p) => !pricedIds.has(p.id));

export const PHONES: RefModel[] = [...pricedPhones, ...extraOnly].sort((a, b) => a.brand.localeCompare(b.brand) || (b.year ?? 0) - (a.year ?? 0) || a.model.localeCompare(b.model));

export const LAPTOPS: RefModel[] = [
  ...(laptopsData as LaptopJson).models.map((m) => ({ ...m, category: "laptop" as const, verified: "spec" as const })),
  ...(laptopsExtra as LaptopJson).models.map((m) => ({ ...m, category: "laptop" as const })),
].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model, undefined, { numeric: true }));

type TradeInDevicesJson = { devices: { category: "tablet" | "watch"; brand: string; model: string; year: number; storage?: string[]; size?: string[]; cpu?: string[]; ram?: string[] }[] };

/**
 * Names suppliers give tablets that the trade-in names leave out: Apple's generation and chip
 * ("iPad 9th Gen", "iPad Air M1" for "iPad 10.2 (2021)", "iPad Air (2022)"), a Galaxy Tab without its
 * screen size ("Galaxy Tab A8"). An iPad Air or Pro without a size is the 11-inch one.
 */
const TABLET_ALIASES: Record<string, string[]> = {
  "Apple::iPad 9.7 (2017)": ["iPad 5th Gen", "iPad 5"],
  "Apple::iPad 9.7 (2018)": ["iPad 6th Gen", "iPad 6"],
  "Apple::iPad 10.2 (2019)": ["iPad 7th Gen", "iPad 7"],
  "Apple::iPad 10.2 (2020)": ["iPad 8th Gen", "iPad 8"],
  "Apple::iPad 10.2 (2021)": ["iPad 9th Gen", "iPad 9"],
  "Apple::iPad 10.9 (2022)": ["iPad 10th Gen", "iPad 10"],
  "Apple::iPad 11 (2025)": ["iPad 11th Gen", "iPad A16"],
  "Apple::iPad Air 2": ["iPad Air 2nd Gen"],
  "Apple::iPad Air (2019)": ["iPad Air 3rd Gen", "iPad Air 3"],
  "Apple::iPad Air (2020)": ["iPad Air 4th Gen", "iPad Air 4"],
  "Apple::iPad Air (2022)": ["iPad Air 5th Gen", "iPad Air 5", "iPad Air M1"],
  "Apple::iPad Air 11 (2024)": ["iPad Air 6th Gen", "iPad Air M2", "iPad Air 11 M2"],
  "Apple::iPad Air 13 (2024)": ["iPad Air 13 6th Gen", "iPad Air 13 M2"],
  "Apple::iPad Air 11 (2025)": ["iPad Air 7th Gen", "iPad Air M3", "iPad Air 11 M3"],
  "Apple::iPad Air 13 (2025)": ["iPad Air 13 7th Gen", "iPad Air 13 M3"],
  "Apple::iPad Air 11 (2026)": ["iPad Air 8th Gen", "iPad Air M4", "iPad Air 11 M4"],
  "Apple::iPad Air 13 (2026)": ["iPad Air 13 8th Gen", "iPad Air 13 M4"],
  "Apple::iPad Mini (2019)": ["iPad Mini 5th Gen", "iPad Mini 5"],
  "Apple::iPad Mini (2021)": ["iPad Mini 6th Gen", "iPad Mini 6"],
  "Apple::iPad Mini (2024)": ["iPad Mini 7th Gen", "iPad Mini 7", "iPad Mini A17 Pro"],
  "Apple::iPad Pro 11 (2018)": ["iPad Pro 11 1st Gen"],
  "Apple::iPad Pro 11 (2020)": ["iPad Pro 11 2nd Gen"],
  "Apple::iPad Pro 11 (2021)": ["iPad Pro 11 3rd Gen", "iPad Pro 11 M1"],
  "Apple::iPad Pro 11 (2022)": ["iPad Pro 11 4th Gen", "iPad Pro 11 M2"],
  "Apple::iPad Pro 11 (2024)": ["iPad Pro 11 5th Gen", "iPad Pro M4", "iPad Pro 11 M4"],
  "Apple::iPad Pro 11 (2025)": ["iPad Pro M5", "iPad Pro 11 M5"],
  "Apple::iPad Pro 12.9 (2015)": ["iPad Pro 12.9 1st Gen"],
  "Apple::iPad Pro 12.9 (2017)": ["iPad Pro 12.9 2nd Gen"],
  "Apple::iPad Pro 12.9 (2018)": ["iPad Pro 12.9 3rd Gen"],
  "Apple::iPad Pro 12.9 (2020)": ["iPad Pro 12.9 4th Gen"],
  "Apple::iPad Pro 12.9 (2021)": ["iPad Pro 12.9 5th Gen", "iPad Pro 12.9 M1"],
  "Apple::iPad Pro 12.9 (2022)": ["iPad Pro 12.9 6th Gen", "iPad Pro 12.9 M2"],
  "Apple::iPad Pro 13 (2024)": ["iPad Pro 13 M4"],
  "Apple::iPad Pro 13 (2025)": ["iPad Pro 13 M5"],
  "Samsung::Galaxy Tab A8 10.5 (2021)": ["Galaxy Tab A8"],
  "Samsung::Galaxy Tab A7 Lite 8.7": ["Galaxy Tab A7 Lite"],
  "Samsung::Galaxy Tab A7 10.4 (2020)": ["Galaxy Tab A7"],
  "Samsung::Galaxy Tab S5e 10.5": ["Galaxy Tab S5e"],
  "Samsung::Galaxy Tab S4 10.5": ["Galaxy Tab S4"],
  "Samsung::Galaxy Tab S3 9.7": ["Galaxy Tab S3"],
  "Samsung::Galaxy Tab S2 8.0": ["Galaxy Tab S2"],
  "Samsung::Galaxy Tab S2 9.7": ["Galaxy Tab S2"],
};

/** Tablets and watches, from the trade-in history (B2C-Backend/ml/import_tradein.py writes the file). */
export const OTHER_DEVICES: RefModel[] = (tradeInDevices as TradeInDevicesJson).devices.map((d) => ({
  id: slug(`${d.brand}${d.model}`),
  category: d.category,
  brand: d.brand,
  model: d.model,
  year: d.year,
  storage: d.storage,
  size: d.size,
  cpu: d.cpu,
  ram: d.ram,
  aliases: TABLET_ALIASES[`${d.brand}::${d.model}`],
}));

// "Surface Pro 9" is both a trade-in tablet and a laptop: quotes keep the laptop, which has its configurations.
const laptopNames = new Set(LAPTOPS.map((r) => `${r.brand}::${r.model}`));
export const TABLETS: RefModel[] = OTHER_DEVICES.filter((r) => r.category === "tablet" && !laptopNames.has(`${r.brand}::${r.model}`));

/** What quotes can recognise (matcher, suggestions): laptops, phones and tablets. Watches not yet. */
export const CATALOG: RefModel[] = [...LAPTOPS, ...PHONES, ...TABLETS];

/** Everything a price can be set for (Mes prix): laptops, phones, tablets and watches. */
export const PRICE_CATALOG: RefModel[] = [...LAPTOPS, ...PHONES, ...OTHER_DEVICES];

/** Short type label in model pickers. */
export const KIND_LABEL: Record<Category, string> = { laptop: "PC", phone: "Tél.", tablet: "Tablette", watch: "Montre" };

/** Phones and tablets are told apart by capacity only; laptops by CPU, RAM and storage too. */
export const byCapacity = (c?: Category) => c === "phone" || c === "tablet";

/** Fallback capacities when a phone or a tablet has no known storage list. */
export const PHONE_STORAGE = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];
export const phoneStorage = (ref?: RefModel) => ref?.storage?.length ? ref.storage : PHONE_STORAGE;

export const getRef = (id?: string) => (id ? PRICE_CATALOG.find((r) => r.id === id) : undefined);
