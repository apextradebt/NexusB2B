import phonesData from "@/data/phones.json";
import laptopsData from "@/data/laptops.json";
import type { RefModel } from "@/types";

import laptopsExtra from "@/data/laptops-extra.json";
import phonesExtra from "@/data/phones-extra.json";

type PhoneJson = { brands: { name: string; models: { model: string; basePrice: number }[] }[] };
type LaptopJson = { models: Omit<RefModel, "category">[] };
type PhoneExtraJson = { phones: { brand: string; model: string; year: number; storage: string[] }[] };

// "+" must survive: "Galaxy S21" and "Galaxy S21+" are different phones.
const slug = (s: string) => s.toUpperCase().replace(/\+/g, "PLUS").replace(/[^A-Z0-9]/g, "");

const extraPhones = (phonesExtra as PhoneExtraJson).phones;
const extraByKey = new Map(extraPhones.map((p) => [`${p.brand}::${p.model}`, p]));

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
  }))
);
// …plus the B2B-only phones (priced by the agents only).
const pricedIds = new Set(pricedPhones.map((p) => p.id));
const extraOnly: RefModel[] = extraPhones
  .map((p) => ({ id: slug(`${p.brand}${p.model}`), category: "phone" as const, brand: p.brand, model: p.model, storage: p.storage, year: p.year }))
  .filter((p) => !pricedIds.has(p.id));

export const PHONES: RefModel[] = [...pricedPhones, ...extraOnly].sort((a, b) => a.brand.localeCompare(b.brand) || (b.year ?? 0) - (a.year ?? 0) || a.model.localeCompare(b.model));

export const LAPTOPS: RefModel[] = [
  ...(laptopsData as LaptopJson).models.map((m) => ({ ...m, category: "laptop" as const, verified: "spec" as const })),
  ...(laptopsExtra as LaptopJson).models.map((m) => ({ ...m, category: "laptop" as const })),
].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model, undefined, { numeric: true }));

export const CATALOG: RefModel[] = [...LAPTOPS, ...PHONES];

/** Fallback capacities when a phone has no known storage list. */
export const PHONE_STORAGE = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];
export const phoneStorage = (ref?: RefModel) => ref?.storage?.length ? ref.storage : PHONE_STORAGE;

export const getRef =(id?: string) => (id ? CATALOG.find((r) => r.id === id) : undefined);
