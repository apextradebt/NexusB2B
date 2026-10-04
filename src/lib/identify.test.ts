import { afterEach, describe, expect, it, vi } from "vitest";
import { groupLines } from "@/lib/group";
import { catalogMac, catalogPc, catalogPhone, factoryVariant, identifierIn, identify, identifyMatches, lineIdentifier, lookupFor, serialSources } from "@/lib/identify";
import { matchLine } from "@/lib/match";
import { buildLines } from "@/lib/parse";
import type { RawLine } from "@/types";

const phone = (brand: string, model: string) => catalogPhone(brand, model)?.model;
const mac = (name: string) => catalogMac(name)?.model;
const pc = (brand: string, name: string, productNumber?: string) => catalogPc(brand, name, productNumber)?.model;

describe("identifierIn (IMEI or serial typed in the quick search)", () => {
  it("reads an IMEI, with or without spaces, and keeps only its TAC", () => {
    expect(identifierIn("357474401234565")).toEqual({ kind: "imei", tac: "35747440" });
    expect(identifierIn("35 747440 123456 5")).toEqual({ kind: "imei", tac: "35747440" });
  });

  it("reads a serial number: one word mixing letters and digits", () => {
    expect(identifierIn("c02xk0aajgh5")).toEqual({ kind: "serial", serial: "C02XK0AAJGH5" });
    expect(identifierIn("L4XK7WF9QF")).toEqual({ kind: "serial", serial: "L4XK7WF9QF" });
    expect(identifierIn("pf2w2glt")).toEqual({ kind: "serial", serial: "PF2W2GLT" }); // Lenovo
    expect(identifierIn("5CG0353JTQ")).toEqual({ kind: "serial", serial: "5CG0353JTQ" }); // HP
  });

  it("takes the serial number out of a scanned Lenovo label", () => {
    expect(identifierIn("1S20T7S0JW00PF2W2GLT")).toEqual({ kind: "serial", serial: "PF2W2GLT" });
  });

  it("leaves model names alone", () => {
    expect(identifierIn("iPhone 13 128 Go")).toBeNull();
    expect(identifierIn("Latitude 5420 i5-1145G7 16/256")).toBeNull();
    expect(identifierIn("iPhone 13 Pro Max")).toBeNull();
    expect(identifierIn("35747440")).toBeNull(); // a TAC alone is not an IMEI
    expect(identifierIn("ABCDEFGHIJ")).toBeNull();
  });
});

describe("catalogPhone (TAC database name → catalogue)", () => {
  it("matches with or without the brand in the catalogue name", () => {
    expect(phone("APPLE", "IPHONE 13")).toBe("iPhone 13");
    expect(phone("SAMSUNG", "GALAXY A34")).toBe("Galaxy A34");
    expect(phone("GOOGLE", "PIXEL 7A")).toBe("Pixel 7a");
  });

  it("drops the network suffix of the TAC name, but never a +", () => {
    expect(phone("SAMSUNG", "GALAXY A53 5G")).toBe("Galaxy A53");
    expect(phone("SAMSUNG", "GALAXY S22 5G")).toBe("Galaxy S22");
    expect(phone("SAMSUNG", "GALAXY S22+ 5G")).toBe("Galaxy S22+");
  });

  it("tells the iPhone SE generations apart", () => {
    expect(phone("APPLE", "IPHONE SE")).toBe("iPhone SE");
    expect(phone("APPLE", "IPHONE SE (2ND GEN)")).toBe("iPhone SE (2020)");
    expect(phone("APPLE", "IPHONE SE (3RD GEN)")).toBe("iPhone SE (2022)");
  });

  it("does not guess when the TAC name is less precise than the catalogue", () => {
    expect(phone("MOTOROLA", "RAZR")).toBeUndefined(); // "Razr 5G"? "Razr (2019)"?
    expect(phone("APPLE", "WATCH SERIES 9")).toBeUndefined();
  });
});

describe("catalogMac (Apple's model name → catalogue)", () => {
  // Names as Apple's lookup (and its "Identify your Mac" pages) writes them.
  it("matches family, size, chip and year", () => {
    expect(mac("MacBook Pro (13-inch, 2019, Two Thunderbolt 3 ports)")).toBe("MacBook Pro 13 2019 Intel");
    expect(mac("MacBook Pro (13-inch, 2020, Four Thunderbolt 3 ports)")).toBe("MacBook Pro 13 2020 Intel");
    expect(mac("MacBook Pro (13-inch, M1, 2020)")).toBe("MacBook Pro 13 M1 2020");
    expect(mac("MacBook Pro (15-inch, 2018)")).toBe("MacBook Pro 15 2018 Intel");
    expect(mac("MacBook Pro (16-inch, 2019)")).toBe("MacBook Pro 16 2019 Intel");
    expect(mac("MacBook Air (Retina, 13-inch, 2018)")).toBe("MacBook Air 2018 Intel");
    expect(mac("MacBook Air (Retina, 13-inch, 2020)")).toBe("MacBook Air 2020 Intel");
    expect(mac("MacBook Air (M1, 2020)")).toBe("MacBook Air M1 2020");
    expect(mac("iMac (Retina 4K, 21.5-inch, 2019)")).toBe("iMac 21.5 2019 Intel");
    expect(mac("iMac (21.5-inch, 2017)")).toBe("iMac 21.5 2017 Intel");
    expect(mac("iMac (Retina 5K, 27-inch, 2020)")).toBe("iMac 27 2020 Intel");
    expect(mac("Mac mini (2018)")).toBe("Mac mini 2018 Intel");
    expect(mac("Mac mini (M1, 2020)")).toBe("Mac mini M1 2020");
  });

  it("finds nothing for Macs the catalogue doesn't list", () => {
    expect(mac("MacBook Pro (13-inch, 2018, Four Thunderbolt 3 ports)")).toBeUndefined();
    expect(mac("MacBook Air (13-inch, 2017)")).toBeUndefined();
    expect(mac("iMac Pro (2017)")).toBeUndefined();
    expect(mac("MacBook Pro (Retina, 13-inch, Early 2015)")).toBeUndefined();
  });
});

describe("serialSources (who to ask about a serial number)", () => {
  it("asks Lenovo for 8 characters, HP, Fujitsu then Apple for 10, Apple for the rest", () => {
    expect(serialSources("PF2W2GLT")).toEqual(["lenovo"]);
    expect(serialSources("5CG0353JTQ")).toEqual(["hp", "fujitsu", "apple"]);
    expect(serialSources("C02XK0AAJGH5")).toEqual(["apple"]);
  });
});

describe("catalogPc (Lenovo or HP name → catalogue)", () => {
  it("matches Lenovo's machine type when the catalogue lists it", () => {
    expect(pc("Lenovo", "T14 Gen 1", "20S0S1AB00")).toBe("ThinkPad T14 Gen 1");
    expect(pc("Lenovo", "?", "20UDS0XY00")).toBe("ThinkPad T14 Gen 1"); // AMD machine type
    expect(pc("Lenovo", "?", "20RXS0XY00")).toBe("ThinkPad T490"); // "10th gen 20RX/20RY"
  });

  it("matches the name word for word, extra words after it allowed", () => {
    expect(pc("Lenovo", "ThinkPad E14 Gen 2", "20T7S0JW00")).toBe("ThinkPad E14 Gen 2");
    expect(pc("Lenovo", "ThinkPad X1 Carbon 9th Gen")).toBe("ThinkPad X1 Carbon Gen 9");
    expect(pc("HP", "ProBook 450 G8", "2X7X3EA")).toBe("ProBook 450 G8");
    expect(pc("HP", "ZBook Firefly 14 G8 Mobile Workstation")).toBe("ZBook Firefly 14 G8");
    expect(pc("Fujitsu", "LIFEBOOK U7411", "U7411MF5CMCH")).toBe("LIFEBOOK U7411");
  });

  it("finds nothing for models the catalogue doesn't list", () => {
    expect(pc("HP", "EliteBook x360 1040 G6")).toBeUndefined();
    expect(pc("HP", "EliteBook 840 G1")).toBeUndefined(); // not G10 or G11
    expect(pc("Lenovo", "ThinkPad E14")).toBeUndefined(); // Gen 1: the catalogue only has Gen 2 and 4
    expect(pc("Lenovo", "IdeaPad S145-15API", "81UT00D8TX")).toBeUndefined();
  });
});

describe("factoryVariant (configuration from the serial number)", () => {
  const found = (specs: object) => ({ kind: "serial" as const, found: true as const, brand: "Lenovo", name: "", specs });

  it("keeps the factory options the model was sold with", () => {
    const e14 = catalogPc("Lenovo", "ThinkPad E14 Gen 2")!;
    expect(factoryVariant(e14, found({ cpu: "Ryzen 7 4700U", ram: "8GB", storage: "256GB", screen: '14"' })))
      .toEqual({ cpu: "Ryzen 7 4700U", ram: "8GB", storage: "256GB" });
  });

  it("gives nothing for a Mac or an IMEI", () => {
    const e14 = catalogPc("Lenovo", "ThinkPad E14 Gen 2")!;
    expect(factoryVariant(e14, { kind: "serial", found: true, brand: "Apple", name: "MacBook Air (M1, 2020)" })).toEqual({});
    expect(factoryVariant(e14, null)).toEqual({});
  });
});

describe("identify (serial number lookups on the backend)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Backend stub: path → [status, body]; records the paths asked. */
  const backend = (routes: Record<string, [number, object?]>) => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);
      const [status, body] = routes[path] ?? [404];
      return new Response(JSON.stringify(body ?? {}), { status });
    }));
    return asked;
  };

  it("asks HP before Apple, and stops at the first that knows the number", async () => {
    const asked = backend({
      "/api/lookup/pc-serial/hp/5CG0353JTA": [200, { found: true, brand: "HP", name: "ProBook 450 G8", productNumber: "2X7X3EA", specs: { cpu: "i5-1135G7" } }],
    });
    const id = await identify({ kind: "serial", serial: "5CG0353JTA" });
    expect(id).toMatchObject({ found: true, brand: "HP", name: "ProBook 450 G8", specs: { cpu: "i5-1135G7" } });
    expect(id?.found && id.ref?.model).toBe("ProBook 450 G8");
    expect(asked).toEqual(["/api/lookup/pc-serial/hp/5CG0353JTA"]);
  });

  it("then asks Fujitsu, and Apple last, about a 10-character number", async () => {
    const asked = backend({
      "/api/lookup/pc-serial/hp/L4XK7WF9QA": [200, { found: false, brand: "HP", serial: "L4XK7WF9QA" }],
      "/api/lookup/pc-serial/fujitsu/L4XK7WF9QA": [200, { found: false, brand: "Fujitsu", serial: "L4XK7WF9QA" }],
      "/api/lookup/apple-serial/L4XK7WF9QA": [200, { found: true, serial: "L4XK7WF9QA", name: "MacBook Air (M1, 2020)" }],
    });
    expect(await identify({ kind: "serial", serial: "L4XK7WF9QA" })).toMatchObject({ found: true, brand: "Apple", name: "MacBook Air (M1, 2020)" });
    expect(asked).toEqual(["/api/lookup/pc-serial/hp/L4XK7WF9QA", "/api/lookup/pc-serial/fujitsu/L4XK7WF9QA", "/api/lookup/apple-serial/L4XK7WF9QA"]);
  });

  it("names a Fujitsu laptop from the catalogue", async () => {
    backend({
      "/api/lookup/pc-serial/hp/DSFS012345": [200, { found: false, brand: "HP", serial: "DSFS012345" }],
      "/api/lookup/pc-serial/fujitsu/DSFS012345": [200, { found: true, brand: "Fujitsu", name: "LIFEBOOK U7411", productNumber: "U7411MF5CMCH", specs: { screen: '14"', display: "FHD" } }],
    });
    const id = await identify({ kind: "serial", serial: "DSFS012345" });
    expect(id?.found && id.ref?.model).toBe("LIFEBOOK U7411");
  });

  it("says it isn't a serial number when no maker knows it", async () => {
    backend({ "/api/lookup/pc-serial/lenovo/IPHONE13": [200, { found: false, brand: "Lenovo", serial: "IPHONE13" }] });
    expect(await identify({ kind: "serial", serial: "IPHONE13" })).toBeNull();
  });

  it("asks again about a 2021+ Mac once Macfax's daily limit stopped the lookup", async () => {
    const answers = [{ found: false, serial: "KFXQHXR6MB", reason: "modern_serial" }, { found: true, serial: "KFXQHXR6MB", name: "MacBook Air (M2, 2022)" }];
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new URL(url).pathname.startsWith("/api/lookup/apple-serial/") ? new Response(JSON.stringify(answers.shift())) : new Response(JSON.stringify({ found: false }))));
    const id = { kind: "serial" as const, serial: "KFXQHXR6MB" };
    expect(await identify(id)).toMatchObject({ found: false, reason: "modern_serial" });
    const again = await identify(id);
    expect(again).toMatchObject({ found: true, name: "MacBook Air (M2, 2022)" });
    expect(again?.found && again.ref?.model).toBe("MacBook Air M2 2022");
  });

  it("rejects when a maker's lookup failed and none knew the number", async () => {
    backend({ "/api/lookup/pc-serial/hp/5CG0353JTB": [502], "/api/lookup/pc-serial/fujitsu/5CG0353JTB": [200, { found: false }], "/api/lookup/apple-serial/5CG0353JTB": [400] });
    await expect(identify({ kind: "serial", serial: "5CG0353JTB" })).rejects.toThrow();
  });
});

describe("quotes: serial numbers and IMEIs of imported lines", () => {
  afterEach(() => vi.unstubAllGlobals());

  const raw = (text: string, extra: Partial<RawLine> = {}): RawLine => ({ row: 1, text, quantity: 1, ...extra });
  const stub = (routes: Record<string, object>) => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);
      return routes[path] ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 400 });
    }));
    return asked;
  };

  it("finds the number in the serial column, or the text when it is one", () => {
    expect(lineIdentifier(raw("ThinkPad E14", { serial: "PF2W2GLT" }))).toEqual({ kind: "serial", serial: "PF2W2GLT" });
    expect(lineIdentifier(raw("PF2W2GLT"))).toEqual({ kind: "serial", serial: "PF2W2GLT" });
    expect(lineIdentifier(raw("357474401234565"))).toEqual({ kind: "imei", tac: "35747440" });
    expect(lineIdentifier(raw("ThinkPad E14 Gen 2 i5"))).toBeNull();
  });

  it("asks everyone about unknown lines, only Lenovo or HP about their incomplete laptops, nobody otherwise", () => {
    const serial = { kind: "serial" as const, serial: "PF2W2GLT" };
    expect(lookupFor(serial, matchLine(raw("PF2W2GLT")))).toBe("all");
    expect(lookupFor(serial, matchLine(raw("ThinkPad E14 Gen 2")))).toEqual(["lenovo"]);
    expect(lookupFor(serial, matchLine(raw("ThinkPad E14 Gen 2 Ryzen 7 4700U 8GB 256GB SSD")))).toBeNull();
    expect(lookupFor({ kind: "imei", tac: "35747440" }, matchLine(raw("iPhone 13 128GB")))).toBeNull();
  });

  it("names a serial-only line and fills its factory configuration", async () => {
    stub({ "/api/lookup/pc-serial/lenovo/PF2W2GLA": { found: true, brand: "Lenovo", name: "ThinkPad E14 Gen 2", productNumber: "20T7S0JW00", specs: { cpu: "Ryzen 7 4700U", ram: "8GB", storage: "256GB" } } });
    const lines = [raw("PF2W2GLA")];
    const [m] = await identifyMatches(lines, lines.map(matchLine));
    expect(m).toMatchObject({ status: "matched", ref: { model: "ThinkPad E14 Gen 2" }, variant: { cpu: "Ryzen 7 4700U", ram: "8GB", storage: "256GB" } });
    expect(m.warnings).toEqual([]);
  });

  it("keeps what the line says over the factory configuration (upgrades)", async () => {
    stub({ "/api/lookup/pc-serial/lenovo/PF2W2GLB": { found: true, brand: "Lenovo", name: "ThinkPad E14 Gen 2", productNumber: "20T7S0JW00", specs: { cpu: "Ryzen 7 4700U", ram: "8GB", storage: "256GB" } } });
    const lines = [raw("ThinkPad E14 Gen 2 16GB", { serial: "PF2W2GLB", ram: "16GB" })];
    const [m] = await identifyMatches(lines, lines.map(matchLine));
    expect(m.variant).toEqual({ cpu: "Ryzen 7 4700U", ram: "16GB", storage: "256GB" });
  });

  it("names devices the catalogue lacks, and groups them by that name", async () => {
    const hp = { found: true, brand: "HP", name: "EliteBook x360 1040 G6", productNumber: "18T03UC", specs: { cpu: "i7-8565U", ram: "16GB", storage: "256GB" } };
    stub({ "/api/lookup/pc-serial/hp/5CG0353JTC": hp, "/api/lookup/pc-serial/hp/5CG0353JTD": hp });
    const lines = [raw("5CG0353JTC"), { ...raw("5CG0353JTD"), row: 2 }];
    const matches = await identifyMatches(lines, lines.map(matchLine));
    expect(matches[0]).toMatchObject({ status: "unmatched", identified: { brand: "HP", model: "EliteBook x360 1040 G6" } });
    // The configuration is known, only the model is missing.
    expect(matches[0].warnings).toEqual(["N° de série : HP EliteBook x360 1040 G6 (i7-8565U · 16GB · 256GB), absent du catalogue"]);
    const grouped = groupLines(lines, matches, "C");
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ brand: "HP", model: "EliteBook x360 1040 G6", quantity: 2, sourceRows: [1, 2] });
  });

  it("says why an unknown line's number didn't help, and never touches lines the text named", async () => {
    stub({ "/api/lookup/tac/35999999": { found: false, tac: "35999999" } });
    const lines = [raw("359999991234567"), raw("ZZ9ZZ9ZZ"), raw("iPhone 13 128GB", { serial: "359999991234567" })];
    const matches = await identifyMatches(lines, lines.map(matchLine));
    expect(matches[0].warnings).toContain("IMEI non reconnu (TAC 35999999 absent de la base)");
    expect(matches[1].warnings).toContain("N° de série non reconnu");
    expect(matches[2]).toEqual(matchLine(lines[2]));
  });

  it("reads a serial-only row of an imported file", () => {
    const table = { headers: ["N° de série", "Grade"], rows: [["PF2W2GLT", ""], ["5CG0353JTQ", "B"]] };
    const lines = buildLines(table, { mapping: { "N° de série": "serial", Grade: "grade" }, gradeColumns: {} });
    expect(lines.map((l) => [l.text, l.serial, l.gradeRaw])).toEqual([["PF2W2GLT", "PF2W2GLT", undefined], ["5CG0353JTQ", "5CG0353JTQ", "B"]]);
  });
});
