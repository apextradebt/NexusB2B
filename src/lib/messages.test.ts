import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { countryName, countryNote, tm } from "@/lib/messages";
import { DEFAULT_COSTS } from "@/lib/costs";

describe("messages written in French by the code", () => {
  afterEach(() => i18n.changeLanguage("fr"));

  it("are kept as is in French", () => {
    expect(tm("RAM non renseignée")).toBe("RAM non renseignée");
  });

  it("are translated in English, their parts too", async () => {
    await i18n.changeLanguage("en");
    expect(tm("RAM non renseignée")).toBe("RAM not given");
    expect(tm("CPU i5 ambigu (3 options)")).toBe("CPU i5 ambiguous (3 options)");
    expect(tm("Les règles proposaient Lenovo ThinkPad P14s Gen 2")).toBe("The rules suggested Lenovo ThinkPad P14s Gen 2");
    expect(tm("Revente marché (inférieur à votre prix) − coûts − marge")).toBe("Market resale (below your price) − costs − margin");
    expect(tm("ajusté du grade A, configuration du devis incomplète")).toBe("adjusted from grade A, quote configuration incomplete");
    // Unknown text (a server message, a model name) stays.
    expect(tm("Dell Latitude 5420")).toBe("Dell Latitude 5420");
  });

  it("leave country names and notes the user edited", async () => {
    await i18n.changeLanguage("en");
    const se = DEFAULT_COSTS.countries.find((c) => c.code === "SE")!;
    expect(countryName(se)).toBe("Sweden");
    expect(countryName({ ...se, name: "Suède (entrepôt)" })).toBe("Suède (entrepôt)");
    expect(countryNote(se)).toMatch(/^Copyswede, per-GB levy/);
    expect(countryNote({ ...se, note: "Mon tarif" })).toBe("Mon tarif");
  });
});
