import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAi, askAi, candidatesFor, needsAi, startAi } from "@/lib/aiMatch";
import { getRef } from "@/lib/catalog";
import { groupLines } from "@/lib/group";
import { matchLine } from "@/lib/match";
import type { Draft } from "@/lib/store";
import type { QuoteLine } from "@/types";

const models = (text: string) => candidatesFor(text).map((r) => r.model);

/** Quote lines as the matching step builds them, one per text. */
const linesOf = (...texts: string[]) => {
  const raw = texts.map((text, i) => ({ row: i + 1, text, quantity: 1 }));
  return groupLines(raw, raw.map(matchLine), "C");
};
const byText = (lines: QuoteLine[], text: string) => lines.find((l) => l.sampleText === text)!;

describe("candidatesFor (catalogue models the AI chooses from)", () => {
  it("finds the model behind typos, shorthand and glued names", () => {
    expect(models("Lattitude 5420 i5 16/256")[0]).toBe("Latitude 5420");
    expect(models("Samsung SGS21 Ultra 256GB")[0]).toBe("Galaxy S21 Ultra");
    expect(models("HP EliteBook 840G5")[0]).toBe("EliteBook 840 G5");
    expect(models("Pixel7a")[0]).toBe("Pixel 7a");
    expect(models("MBP 13 2020 M1 8/256")).toContain("MacBook Pro 13 M1 2020");
    expect(models("Surface Pro7 i5 8/128")).toContain("Surface Pro 7");
  });

  it("keeps the siblings the AI has to tell apart, at most 12", () => {
    const list = models("iphon 13 pro 128");
    expect(list).toEqual(expect.arrayContaining(["iPhone 13 Pro", "iPhone 13 Pro Max", "iPhone 13"]));
    expect(list.length).toBeLessThanOrEqual(12);
  });

  it("offers nothing for lines that name no device", () => {
    expect(candidatesFor("Total")).toEqual([]);
    expect(candidatesFor("Câble USB-C")).toEqual([]);
  });
});

describe("needsAi", () => {
  const [matched, review, unmatched] = [
    linesOf("Latitude 5420 i5-1145G7 16GB 256GB")[0],
    linesOf("MS Surface P7 i5 8/128")[0],
    linesOf("Samsung S21U 256GB")[0],
  ];

  it("asks about every recognised line, once, and never about what the user settled", () => {
    expect([matched.status, review.status, unmatched.status]).toEqual(["matched", "review", "unmatched"]);
    expect(needsAi(matched)).toBe(true);
    expect(needsAi(review)).toBe(true);
    expect(needsAi(unmatched)).toBe(true);
    expect(needsAi({ ...review, edited: true })).toBe(false);
    expect(needsAi({ ...review, auto: { ...review.auto!, ai: {} } })).toBe(false);
    // A line entered by hand was never recognised.
    expect(needsAi({ ...matched, auto: undefined })).toBe(false);
  });

  it("skips a bare serial number and a model the maker named from it, asks with a name the catalogue lacks", () => {
    const serial = linesOf("PF2W2GLT")[0];
    expect(needsAi(serial)).toBe(false);
    expect(needsAi({ ...serial, brand: "Lenovo", model: "ThinkPad Something Gen 7" })).toBe(true);
    expect(needsAi({ ...serial, refId: "LENOVOTHINKPADE14GEN2", brand: "Lenovo", model: "ThinkPad E14 Gen 2" })).toBe(false);
  });
});

describe("askAi (backend call)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (reply: (body: any) => [number, object]) => {
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(new URL(url).pathname).toBe("/api/b2b/resolve");
      const body = JSON.parse(init.body as string);
      sent.push(body);
      const [status, out] = reply(body);
      return new Response(JSON.stringify(out), { status });
    }));
    return sent;
  };

  it("sends each text once with its candidates, and maps the answers back", async () => {
    const lines = linesOf("Samsung SGS21 Ultra 256GB", "Surface Pro7 i5 8/128", "Latitude 5420 i5-1145G7 16GB 256GB", "Total");
    lines.push({ ...byText(lines, "Samsung SGS21 Ultra 256GB"), key: "dup", sampleText: "Samsung SGS21 Ultra 256GB" });
    // The backend fails on the second line, every time.
    const sent = stub((body) => [200, { picks: body.lines.map((l: any) => l.candidates[0].id), failed: sent.length === 1 ? [1] : [0] }]);
    const { picks, asked, failed } = await askAi(lines);

    // Asked once more, alone.
    expect(sent).toHaveLength(2);
    expect(sent[1].lines).toEqual([sent[0].lines[1]]);
    const texts = sent[0].lines.map((l: any) => l.text);
    expect([...texts].sort()).toEqual(["Latitude 5420 i5-1145G7 16GB 256GB", "Samsung SGS21 Ultra 256GB", "Surface Pro7 i5 8/128"]);
    const s21 = sent[0].lines[texts.indexOf("Samsung SGS21 Ultra 256GB")];
    expect(s21.candidates[0]).toEqual({ id: getRef(s21.candidates[0].id)!.id, name: "Samsung Galaxy S21 Ultra" });
    expect([asked, failed]).toEqual([3, 1]);
    // No answer for it, rather than "none".
    expect([...picks.keys()]).toEqual([texts[0], texts[2]]);
  });

  it("keeps the answers of the batches that got through when another fails", async () => {
    const texts = Array.from({ length: 10 }, (_, i) => `iPhone ${11 + (i % 5)} ${[64, 128][i % 2]}GB ${i}`);
    // The batch of 8 times out, on the retry too; the batch of 2 is answered.
    stub((body) => (body.lines.length === 8 ? [504, { error: "timeout" }] : [200, { picks: body.lines.map(() => null), failed: [] }]));
    const { picks, asked, failed } = await askAi(linesOf(...texts));
    expect([picks.size, asked, failed]).toEqual([2, 10, 8]);
  });

  it("always offers the rules' own pick, so the AI can confirm it", async () => {
    const sent = stub((body) => [200, { picks: body.lines.map(() => null), failed: [] }]);
    // "Dell 5550" is read as a Latitude 5550 by the rules, a Precision 5550 being just as likely.
    const [line] = linesOf("Dell 5550 i7 32/512");
    expect(line.model).toBe("Latitude 5550");
    await askAi([line]);
    expect(sent[0].lines[0].candidates.map((c: any) => c.name)).toEqual(expect.arrayContaining(["Dell Latitude 5550", "Dell Precision 5550"]));
    expect(sent[0].lines[0].candidates.length).toBeLessThanOrEqual(12);
  });

  it("asks nothing when every line was settled by hand", async () => {
    const sent = stub(() => [200, { picks: [], failed: [] }]);
    expect((await askAi(linesOf("Latitude 5420 i5-1145G7 16GB 256GB").map((l) => ({ ...l, edited: true })))).asked).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("rejects with the backend's reason", async () => {
    stub(() => [503, { error: "Ollama ne répond pas (est-il lancé ?)." }]);
    await expect(askAi(linesOf("Samsung SGS21 Ultra 256GB"))).rejects.toThrow("Ollama ne répond pas");
  });
});

describe("applyAi", () => {
  const lines = linesOf("Samsung S21U 256GB", "MS Surface P7 i5 8/128", "MacBook Pro 14 M1 Pro 16 512", "Dell WD19 Dock", "Latitude 5420 i5-1145G7 16GB 256GB");
  const s21u = candidatesFor("Samsung S21U 256GB").find((r) => r.model === "Galaxy S21 Ultra")!.id;
  const pro7 = candidatesFor("MS Surface P7 i5 8/128").find((r) => r.model === "Surface Pro 7")!.id;
  const mbp = byText(lines, "MacBook Pro 14 M1 Pro 16 512");

  it("puts the picked model on the line, re-resolves its configuration and leaves it to confirm", () => {
    const picks = new Map<string, string | null>([
      ["Samsung S21U 256GB", s21u],
      ["MS Surface P7 i5 8/128", pro7],
      ["MacBook Pro 14 M1 Pro 16 512", mbp.refId!],
      ["Dell WD19 Dock", null],
    ]);
    const { lines: out, changed, rejected } = applyAi(lines, picks);
    expect([changed, rejected]).toEqual([2, 0]);

    const s21 = byText(out, "Samsung S21U 256GB");
    expect(s21).toMatchObject({ refId: s21u, model: "Galaxy S21 Ultra", status: "review", aiNote: "picked", variant: { storage: "256GB" } });
    expect(s21.auto).toMatchObject({ status: "unmatched", ai: { refId: s21u } });
    expect(s21.warnings).not.toContain("Aucun modèle du référentiel ne correspond");

    const pro = byText(out, "MS Surface P7 i5 8/128");
    expect(pro).toMatchObject({ model: "Surface Pro 7", status: "review", aiNote: "picked" });
    expect(pro.warnings).toContain("Les règles proposaient Microsoft Surface Duo");
    expect(byText(out, "MacBook Pro 14 M1 Pro 16 512")).toMatchObject({ refId: mbp.refId, aiNote: "confirmed", status: "review" });
    // No candidate fit: an unmatched line stays as it was, with the answer kept for the feedback.
    const dock = byText(out, "Dell WD19 Dock");
    expect(dock).toMatchObject({ status: "unmatched", aiNote: undefined, auto: { ai: { refId: undefined } } });
    // Not asked: left as it was.
    expect(byText(out, "Latitude 5420 i5-1145G7 16GB 256GB")).toBe(byText(lines, "Latitude 5420 i5-1145G7 16GB 256GB"));
  });

  it("removes a model the AI rejects, keeping the rules' pick in a warning, and leaves edited lines alone", () => {
    const edited = lines.map((l) => (l.sampleText === "Samsung S21U 256GB" ? { ...l, edited: true } : l));
    const { lines: out, changed, rejected } = applyAi(edited, new Map([["Samsung S21U 256GB", s21u], ["MS Surface P7 i5 8/128", null]]));
    expect([changed, rejected]).toEqual([0, 1]);
    expect(byText(out, "Samsung S21U 256GB").refId).toBeUndefined();
    expect(byText(out, "MS Surface P7 i5 8/128")).toMatchObject({
      refId: undefined, status: "unmatched", aiNote: "rejected", variant: {}, warnings: ["Les règles proposaient Microsoft Surface Duo"],
      auto: { status: "review", refId: expect.stringContaining("SURFACEDUO"), ai: { refId: undefined } },
    });
  });

  it("corrects lines the rules were sure of, and stays quiet when it agrees", () => {
    const sure = linesOf("Dell 5550 i7 32/512", "Coque iPhone 7 silicone", "Latitude 5420 i5-1145G7 16GB 256GB");
    expect(sure.map((l) => [l.status, l.model]).sort()).toEqual([["matched", "Latitude 5420"], ["matched", "Latitude 5550"], ["matched", "iPhone 7"]]);
    const precision = candidatesFor("Dell 5550 i7 32/512").find((r) => r.model === "Precision 5550")!.id;
    const lat = byText(sure, "Latitude 5420 i5-1145G7 16GB 256GB");
    const { lines: out, changed, rejected } = applyAi(sure, new Map([
      ["Dell 5550 i7 32/512", precision], ["Coque iPhone 7 silicone", null], ["Latitude 5420 i5-1145G7 16GB 256GB", lat.refId!],
    ]));
    expect([changed, rejected]).toEqual([1, 1]);
    // The configuration is read again for the new model.
    expect(byText(out, "Dell 5550 i7 32/512")).toMatchObject({ model: "Precision 5550", status: "review", aiNote: "picked", variant: { ram: "32GB", storage: "512GB" } });
    expect(byText(out, "Dell 5550 i7 32/512").warnings).toContain("Les règles proposaient Dell Latitude 5550");
    expect(byText(out, "Coque iPhone 7 silicone")).toMatchObject({ status: "unmatched", aiNote: "rejected" });
    expect(byText(out, "Latitude 5420 i5-1145G7 16GB 256GB")).toMatchObject({ status: "matched", aiNote: undefined, refId: lat.refId });
  });
});

describe("startAi", () => {
  afterEach(() => vi.unstubAllGlobals());

  const run = async (draftRun: number) => {
    vi.stubGlobal("fetch", vi.fn(async (_: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ picks: body.lines.map((l: any) => l.candidates.find((c: any) => c.name.endsWith("S21 Ultra")).id), failed: [] }));
    }));
    const lines = linesOf("Samsung S21U 256GB");
    let draft = { step: 2, fileName: "", client: "", reference: "", lines, ai: { run: draftRun, state: "running", asked: 0, changed: 0, rejected: 0 } } as Draft;
    startAi(lines, 1, (u) => { draft = typeof u === "function" ? u(draft) : u; }, 0);
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    return draft;
  };

  it("applies the answers to the draft it was started for", async () => {
    const draft = await run(1);
    expect(draft.ai).toMatchObject({ state: "done", asked: 1, changed: 1 });
    expect(draft.lines[0].model).toBe("Galaxy S21 Ultra");
  });

  it("drops answers that arrive after the lines were matched again", async () => {
    const draft = await run(2);
    expect(draft.ai?.state).toBe("running");
    expect(draft.lines[0].refId).toBeUndefined();
  });
});
