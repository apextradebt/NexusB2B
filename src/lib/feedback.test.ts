import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFeedback, newQuoteId, redact, sendFeedback } from "@/lib/feedback";
import { applyAi, candidatesFor } from "@/lib/aiMatch";
import { getRef } from "@/lib/catalog";
import { groupLines, mergeDuplicates } from "@/lib/group";
import { matchAgainst, matchLine } from "@/lib/match";
import { detectLayout, parseText } from "@/lib/parse";
import type { Draft } from "@/lib/store";
import type { QuoteLine } from "@/types";

const linesOf = (...texts: string[]) => {
  const raw = texts.map((text, i) => ({ row: i + 1, text, quantity: 1 }));
  return groupLines(raw, raw.map(matchLine), "C");
};
const draftOf = (lines: QuoteLine[], extra: Partial<Draft> = {}): Draft => ({ step: 2, fileName: "lot.csv", client: "", reference: "", lines, id: newQuoteId(), ...extra });

/** What the user does when picking a model in the matching step. */
const pick = (l: QuoteLine, model: string): QuoteLine => {
  const ref = getRef(candidatesFor(model)[0].id)!;
  const m = matchAgainst({ row: 0, text: l.sampleText, quantity: l.quantity }, ref);
  return { ...l, refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model, variant: m.variant, status: "matched", score: 1, warnings: m.warnings, edited: true };
};

describe("redact", () => {
  it("hides serial numbers and IMEIs, not model names", () => {
    expect(redact("PF2W2GLT")).toBe("[n° de série]");
    expect(redact("357474401234565")).toBe("[imei]");
    expect(redact("iPhone 13 128GB 357474401234565")).toBe("iPhone 13 128GB [imei]");
    expect(redact("iPhone 13 IMEI 35 747440 123456 5")).toBe("iPhone 13 IMEI [imei]");
    expect(redact("EliteBook 840 G6 i5-8265U 16/256")).toBe("EliteBook 840 G6 i5-8265U 16/256");
  });
});

describe("buildFeedback", () => {
  it("reports what the rules and the AI found and what the user kept, line by line", () => {
    let lines = linesOf("Latitude 5420 i5-1145G7 16GB 256GB", "Samsung S21U 256GB", "MS Surface P7 i5 8/128", "PF2W2GLT");
    lines = applyAi(lines, new Map([["Samsung S21U 256GB", candidatesFor("Galaxy S21 Ultra")[0].id]])).lines;
    lines = lines.map((l) => (l.sampleText === "MS Surface P7 i5 8/128" ? pick(l, "Surface Pro 7") : l));
    const serial = lines.find((l) => l.sampleText === "PF2W2GLT")!;
    const fb = buildFeedback(draftOf(lines.filter((l) => l !== serial), { removed: [serial] }));

    const of = (text: string) => fb.lines.find((l) => l.text === text)!;
    expect(fb.lines).toHaveLength(4);
    expect(of("Latitude 5420 i5-1145G7 16GB 256GB")).toMatchObject({ rules: { status: "matched" }, final: { refId: expect.any(String), removed: false }, edited: false });
    expect(of("Latitude 5420 i5-1145G7 16GB 256GB").ai).toBeUndefined();
    expect(of("Samsung S21U 256GB")).toMatchObject({
      rules: { refId: null, status: "unmatched" },
      ai: { refId: expect.stringContaining("S21ULTRA") },
      final: { refId: expect.stringContaining("S21ULTRA"), variant: { storage: "256GB" }, removed: false },
      edited: false,
    });
    expect(of("MS Surface P7 i5 8/128")).toMatchObject({ rules: { status: "review" }, final: { refId: getRef(candidatesFor("Surface Pro 7")[0].id)!.id }, edited: true });
    expect(of("[n° de série]")).toMatchObject({ final: { removed: true } });
  });

  it("keeps the lines merged into others after a correction", () => {
    let lines = linesOf("Latitude 5420 i5-1145G7 16GB 256GB", "L5420 i5-1145G7 16GB 256GB");
    lines = lines.map((l) => (l.status === "matched" ? l : pick(l, "Latitude 5420")));
    const merged = mergeDuplicates(lines);
    expect(merged).toHaveLength(1);
    const fb = buildFeedback(draftOf(merged));
    expect(fb.lines.map((l) => [l.text, l.edited])).toEqual(expect.arrayContaining([
      ["Latitude 5420 i5-1145G7 16GB 256GB", false],
      ["L5420 i5-1145G7 16GB 256GB", true],
    ]));
    expect(new Set(fb.lines.map((l) => l.final.refId)).size).toBe(1);
  });

  it("reports the columns whose role the user changed", () => {
    const table = parseText("Ref;Qty;Notes\nLatitude 5420;3;PF2W2GLT\nThinkPad T14 Gen 2;1;5CG0353JTA");
    const layout = detectLayout(table);
    const notes = table.headers[2];
    const changed = { ...layout, mapping: { ...layout.mapping, [notes]: layout.mapping[notes] === "serial" ? "ignore" as const : "serial" as const } };
    const fb = buildFeedback(draftOf([], { table, layout: changed }));
    expect(fb.columns).toEqual([{ header: notes, samples: ["[n° de série]", "[n° de série]"], detected: layout.mapping[notes], chosen: changed.mapping[notes] }]);
  });
});

describe("sendFeedback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the quote's feedback, and stays quiet when the backend is down", async () => {
    const posted: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      posted.push([new URL(url).pathname, JSON.parse(init.body as string)]);
      throw new TypeError("Failed to fetch");
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const draft = draftOf(linesOf("Latitude 5420 i5-1145G7 16GB 256GB"));
    sendFeedback(draft);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(posted).toEqual([["/api/b2b/match-feedback", expect.objectContaining({ quoteId: draft.id, fileName: "lot.csv" })]]);
    expect(posted[0][1].quoteId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    warn.mockRestore();
  });

  it("sends nothing without a quote id or without recognised lines", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    sendFeedback({ ...draftOf(linesOf("Latitude 5420 i5-1145G7 16GB 256GB")), id: undefined });
    sendFeedback(draftOf([]));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
