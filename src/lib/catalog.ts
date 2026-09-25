import phonesData from "@/data/phones.json";
import laptopsData from "@/data/laptops.json";
import type { RefModel } from "@/types";

type PhoneJson = { brands: { name: string; models: { model: string; basePrice: number }[] }[] };
type LaptopJson = { models: Omit<RefModel, "category">[] };

// "+" must survive: "Galaxy S21" and "Galaxy S21+" are different phones.
const slug = (s: string) => s.toUpperCase().replace(/\+/g, "PLUS").replace(/[^A-Z0-9]/g, "");

export const PHONES: RefModel[] = (phonesData as PhoneJson).brands.flatMap((b) =>
  b.models.map((m) => ({
    id: slug(`${b.name}${m.model}`),
    category: "phone" as const,
    brand: b.name,
    model: m.model,
    basePrice: m.basePrice,
  }))
);

export const LAPTOPS: RefModel[] = (laptopsData as LaptopJson).models.map((m) => ({ ...m, category: "laptop" as const }));

export const CATALOG: RefModel[] = [...LAPTOPS, ...PHONES];

/** Phone capacities offered in dropdowns (phones.json has no per-model storage list). */
export const PHONE_STORAGE = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];

export const getRef =(id?: string) => (id ? CATALOG.find((r) => r.id === id) : undefined);
