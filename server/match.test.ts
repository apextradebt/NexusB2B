import { describe, expect, it } from "vitest";
import { gradeOf, titleMatch } from "./match.ts";
import { isAllowed, parseRobots } from "./http.ts";
import type { Query } from "./types.ts";

const phone = (model: string, storage?: string): Query => ({ category: "phone", brand: model.startsWith("Galaxy") ? "Samsung" : "Apple", model, storage, grade: "B" });
const laptop = (brand: string, model: string, cpu?: string, storage?: string): Query => ({ category: "laptop", brand, model, cpu, storage, grade: "B" });

describe("titleMatch", () => {
  it("accepts the same phone and capacity, whatever the spelling", () => {
    expect(titleMatch("apple iphone 13 128 go minuit", phone("iPhone 13", "128GB"))).toBeGreaterThan(0.8);
    expect(titleMatch("iPhone 13 | 128 GB | Dual-SIM | Grade B", phone("iPhone 13", "128GB"))).toBeGreaterThan(0.8);
  });
  it("rejects other brands, siblings and capacities", () => {
    expect(titleMatch("xiaomi redmi 13 dual sim 128go bleu", phone("iPhone 13", "128GB"))).toBe(0);
    expect(titleMatch("apple iphone 13 pro 128 go", phone("iPhone 13", "128GB"))).toBe(0);
    expect(titleMatch("apple iphone 13 mini 128 go", phone("iPhone 13", "128GB"))).toBe(0);
    expect(titleMatch("apple iphone 13 256 go", phone("iPhone 13", "128GB"))).toBe(0);
    expect(titleMatch("Samsung Galaxy S23+ 256GB", phone("Galaxy S23", "256GB"))).toBe(0);
  });
  it("handles laptop generations and CPUs", () => {
    const q = laptop("Lenovo", "ThinkPad T14 Gen 2", "i5-1145G7", "256GB");
    expect(titleMatch("Lenovo ThinkPad T14 G2 | i5-1145G7 | 14\" | 16 GB | 256 GB SSD | Grade B", q)).toBeGreaterThan(0.8);
    expect(titleMatch("Lenovo ThinkPad T14 G2 | i5-1145G7 | 14\" 16 GB | 256 GB SSD | Webcam | Win 11 Pro | DE | Grade B", q)).toBeGreaterThan(0.8);
    expect(titleMatch("LENOVO THINKPAD T14 (2ND GEN)  i5 1145G7 - Speicher 16GB RAM - 256GB - Betriebssystem Windows 11 Pro", q)).toBeGreaterThan(0.8);
    expect(titleMatch("LENOVO THINKPAD T14 (2ND GEN) Core i5 1145G7 16GB RAM 256GB", q)).toBeGreaterThan(0.8);
    expect(titleMatch("Lenovo ThinkPad T14 G2 | i7-1185G7 | 16 GB | 256 GB SSD", q)).toBe(0);
    expect(titleMatch("Lenovo ThinkPad T14s G2 | i5-1145G7 | 256 GB SSD", q)).toBe(0);
    expect(titleMatch("LENOVO THINKPAD T14 (1ST GEN) i5 10310U", laptop("Lenovo", "ThinkPad T14 Gen 1"))).toBeGreaterThan(0);
    expect(titleMatch("Lenovo Thinkpad T14s | i5-10310U", laptop("Lenovo", "ThinkPad T14s Gen 1"))).toBeGreaterThan(0);
    expect(titleMatch("Lenovo ThinkPad X1 Carbon Gen 12 Ultra 7 155U 32GB 1TB", laptop("Lenovo", "ThinkPad X1 Carbon Gen 12", "Core Ultra 7 155U", "1TB"))).toBeGreaterThan(0.8);
    expect(titleMatch("Samsung Galaxy S23 Ultra 256GB", phone("Galaxy S23", "256GB"))).toBe(0);
    expect(titleMatch("hp elitebook 840 g8 i5 11th gen", laptop("HP", "EliteBook 840 G8", "i5-1135G7"))).toBeGreaterThan(0);
    expect(titleMatch("hp elitebook 840 g7 intel core i5 10th gen", laptop("HP", "EliteBook 840 G8", "i5-1135G7"))).toBe(0);
  });
});

describe("gradeOf", () => {
  it("maps source condition labels", () => {
    expect(gradeOf("A2")).toBe("B");
    expect(gradeOf("Très bon état")).toBe("B");
    expect(gradeOf("Bon état")).toBe("C");
    expect(gradeOf("Sehr gut")).toBe("B");
    expect(gradeOf("État correct")).toBe("D");
    expect(gradeOf("Grade C")).toBe("C");
  });
});

describe("robots.txt", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /acheter/recherche\nDisallow: *?*query=\nAllow: /p/\n\nUser-agent: badbot\nDisallow: /");
  it("honours wildcard rules for our user agent", () => {
    expect(isAllowed(rules, "/acheter/recherche?q=x")).toBe(false);
    expect(isAllowed(rules, "/search/?query=x")).toBe(false);
    expect(isAllowed(rules, "/vendre/apple-iphone-13_1")).toBe(true);
    expect(isAllowed(rules, "/p/iphone-13/1/")).toBe(true);
  });
});
