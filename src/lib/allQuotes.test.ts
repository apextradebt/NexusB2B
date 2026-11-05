import { describe, expect, it } from "vitest";
import { fromB2B, fromB2C, matchesQuery, mergeQuotes, nextRetailStep, type RetailQuote } from "./allQuotes";
import type { SavedQuote } from "@/types";

const b2b = (over: Partial<SavedQuote> = {}): SavedQuote => ({
  id: "Q-1", client: "Acme", reference: "Lot 12", createdAt: "2026-11-02T10:00:00.000Z", fileName: "lot.xlsx", lines: [],
  totals: { units: 40, buy: 8000, sell: 11000, margin: 1500 }, ...over,
});

const b2c = (over: Partial<RetailQuote> = {}): RetailQuote => ({
  id: "DEV-1", date: "2026-11-03T10:00:00.000Z", status: "En boutique", type: "unitaire", totalProposedPrice: 250,
  items: [{ quantity: 1, grade: "B", unitPrice: 250, device: { brand: "Apple", model: "iPhone 13", storage: "128GB" } }],
  client: { firstName: "Jo", lastName: "Client" }, magasin: "Paris", createdBy: { prenom: "Lea", nom: "Martin" },
  sellTotal: 360, margin: 110, ...over,
});

describe("all quotes", () => {
  it("lists both sources, newest first", () => {
    const list = mergeQuotes([b2b()], [b2c(), b2c({ id: "DEV-0", date: "2026-11-01T10:00:00.000Z" })]);
    expect(list.map((q) => q.key)).toEqual(["b2c:DEV-1", "b2b:Q-1", "b2c:DEV-0"]);
  });

  it("keeps the same id apart across sources", () => {
    const list = mergeQuotes([b2b({ id: "X" })], [b2c({ id: "X" })]);
    expect(new Set(list.map((q) => q.key)).size).toBe(2);
  });

  it("puts equivalent statuses in the same stage", () => {
    expect(fromB2B(b2b({ status: "shipped" })).stage).toBe(fromB2C(b2c({ status: "Expédié" })).stage);
    expect(fromB2B(b2b({ status: "paid" })).stage).toBe(fromB2C(b2c({ status: "Clôturé" })).stage);
    expect(fromB2B(b2b({ status: "in_progress" })).stage).toBe(fromB2C(b2c({ status: "Réceptionné" })).stage);
    expect(fromB2C(b2c({ status: "Refusé" })).stage).toBe("refused");
  });

  it("reads a B2B quote saved before statuses existed as just created", () => {
    expect(fromB2B(b2b()).stage).toBe("open");
  });

  it("says who quoted a shop quote, and prefers the client's company", () => {
    const q = fromB2C(b2c({ client: { firstName: "Jo", lastName: "Client", company: "Garage SA" } }));
    expect(q.owner).toBe("Paris · Lea Martin");
    expect(q.client).toBe("Garage SA");
    expect(q.summary).toBe("iPhone 13 128GB B");
  });

  it("leaves the margin unknown when the price list has no sell price", () => {
    const q = fromB2C(b2c({ sellTotal: 0, margin: 0 }));
    expect(q.sell).toBeNull();
    expect(q.margin).toBeNull();
  });

  it("only offers the processing centre's steps, in order", () => {
    expect(nextRetailStep("Devis Envoyé")).toBeNull();
    expect(nextRetailStep("En boutique")).toBeNull();
    expect(nextRetailStep("Refusé")).toBeNull();
    expect(nextRetailStep("Expédié")).toBe("Réceptionné");
    expect(nextRetailStep("Réceptionné")).toBe("En traitement");
    expect(nextRetailStep("En traitement")).toBe("Clôturé");
    expect(nextRetailStep("Clôturé")).toBeNull();
  });

  it("searches id, client, shop, seller and devices", () => {
    const q = fromB2C(b2c());
    for (const s of ["dev-1", "jo client", "paris", "martin", "iphone 13", ""]) expect(matchesQuery(q, s)).toBe(true);
    expect(matchesQuery(q, "samsung")).toBe(false);
  });
});
