import { CATALOG, getRef } from "@/lib/catalog";
import { identifierIn } from "@/lib/identify";
import { matchAgainst, matchLine, normalize, stripSpecs } from "@/lib/match";
import { extractInline } from "@/lib/parse";
import { postJson } from "@/lib/api";
import type { Dispatch, SetStateAction } from "react";
import type { Draft } from "@/lib/store";
import type { QuoteLine, RefModel } from "@/types";

/*
 * Second opinion on every recognised line, from the local model behind the backend: it fills in what
 * the rules could not recognise and catches what they recognised wrongly ("MBP 14 2021" read as an
 * iPhone 14). Each line goes with a short list of catalogue candidates, always including the rules'
 * own pick; the AI answers with one of them or none, so it cannot invent a model. The configuration
 * is then resolved by the rules again.
 */

const MAX_CANDIDATES = 12;
/** Lines per request, and requests at once: small batches so the progress bar moves with the work. */
const CHUNK = 8;
const PARALLEL_REQUESTS = 3;
/** The progress bar fills over at least this long, even when the answers are back sooner. */
export const AI_MIN_MS = 1200;

// Shorthand suppliers use for product lines, expanded before searching the catalogue.
const SHORTHAND: [RegExp, string][] = [
  [/\bmbp\b/g, "macbook pro"],
  [/\bmba\b/g, "macbook air"],
  [/\btp\b/g, "thinkpad"],
  [/\beb\b/g, "elitebook"],
  [/\bpb\b/g, "probook"],
  [/\bzb\b/g, "zbook"],
  [/\blat\b/g, "latitude"],
  [/\bsgs ?(\d)/g, "galaxy s$1"],
];

const NOISE = new Set(["notebook", "laptop", "pc", "portable", "ordinateur", "smartphone", "phone", "telephone", "mobile", "5g", "4g", "dual", "sim", "ds", "grade", "class", "classe"]);

const trigrams = (s: string) => {
  const t = ` ${s.replace(/\s+/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
};

type Indexed = { ref: RefModel; toks: string[]; grams: Set<string> };
let index: Indexed[] | null = null;
const getIndex = () =>
  (index ??= CATALOG.map((ref) => {
    const name = normalize(`${ref.brand} ${ref.model}`);
    return { ref, toks: name.split(" "), grams: trigrams(name) };
  }));

/** Query words of a line: no configuration, grade or quantity; supplier shorthand expanded. */
function queryOf(text: string): string {
  let q = normalize(stripSpecs(extractInline(text).text));
  for (const [rx, to] of SHORTHAND) q = q.replace(rx, to);
  return q.split(" ").filter((w) => w && !NOISE.has(w)).join(" ");
}

/**
 * Catalogue models a line may name, best first: the matcher's own alternatives, then the closest names by
 * shared words (model numbers count most) and shared letter triples (typos, glued words).
 */
export function candidatesFor(text: string, limit = MAX_CANDIDATES): RefModel[] {
  const q = queryOf(text);
  if (!q) return [];
  const words = q.split(" ");
  const grams = trigrams(q);
  const scored = getIndex().map(({ ref, toks, grams: g }) => {
    let s = 0;
    for (const w of words) {
      const key = /\d/.test(w);
      if (toks.includes(w)) s += key ? 3 : 1;
      else if (w.length >= 2 && toks.some((t) => t.startsWith(w) || (t.length >= 3 && w.startsWith(t)))) s += key ? 1 : 0.5;
    }
    let shared = 0;
    for (const x of grams) if (g.has(x)) shared++;
    s += (4 * shared) / (grams.size + g.size);
    return { ref, s };
  });
  // Below 0.45 the matcher's alternatives are noise: first-generation models it credits for any text without a generation.
  const fromRules = matchLine({ row: 0, text, quantity: 1 }).alternatives.filter((a) => a.score >= 0.45).map((a) => a.ref);
  const best = scored.filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).map((x) => x.ref);
  return [...new Set([...fromRules, ...best])].slice(0, limit);
}

/**
 * What to ask the AI about a line: its own text, or the name its serial number gave when the catalogue
 * does not list it. A model the maker named from the serial number is not second-guessed.
 */
function askText(l: QuoteLine): string | undefined {
  if (!identifierIn(l.sampleText)) return l.sampleText;
  const named = `${l.brand} ${l.model}`.trim();
  return !l.refId && named && l.model !== l.sampleText ? named : undefined;
}

/** Lines worth asking about: found by recognition, not settled by hand, not already asked. */
export const needsAi = (l: QuoteLine) => !!l.auto && !l.edited && !l.auto.ai && !!askText(l);

export type AiAnswer = { picks: Map<string, string | null>; asked: number };

/**
 * Ask the backend about the lines (each distinct text once). Resolves with the model picked for each
 * text (null: none of the candidates); texts whose request failed are left out. Rejects when the
 * backend refuses (login required, quota) or cannot be reached.
 */
export async function askAi(lines: QuoteLine[], onProgress?: (done: number, total: number) => void): Promise<AiAnswer> {
  // The rules' pick is always among the candidates, so the AI can confirm it.
  const rulesPicks = new Map<string, Set<string>>();
  for (const l of lines.filter(needsAi)) {
    const text = askText(l)!;
    const refs = rulesPicks.get(text) ?? new Set<string>();
    if (l.refId) refs.add(l.refId);
    rulesPicks.set(text, refs);
  }
  const items = [...rulesPicks].map(([text, refs]) => {
    const found = candidatesFor(text);
    const missing = [...refs].map((id) => getRef(id)).filter((r): r is RefModel => !!r && !found.some((f) => f.id === r.id));
    const candidates = [...missing, ...found].slice(0, MAX_CANDIDATES);
    return { text, candidates: candidates.map((r) => ({ id: r.id, name: `${r.brand} ${r.model}` })) };
  }).filter((x) => x.candidates.length > 0);
  const picks = new Map<string, string | null>();
  if (items.length === 0) return { picks, asked: 0 };

  const chunks: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  let done = 0;
  onProgress?.(0, items.length);
  const ask = async (chunk: typeof items) => {
    const res = await postJson("/api/b2b/resolve", { lines: chunk });
    if (!res.ok) {
      // A 401 comes from the backend's Auth0 check (B2B_AUTH), whose answer is not JSON.
      if (res.status === 401) throw new Error("le backend exige une connexion (B2B_AUTH=optional pour le mode local)");
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const body: { picks: (string | null)[]; failed: number[] } = await res.json();
    const failed = new Set(body.failed);
    chunk.forEach((item, i) => {
      if (!failed.has(i)) picks.set(item.text, body.picks[i] ?? null);
    });
    done += chunk.length;
    onProgress?.(done, items.length);
  };
  const worker = async () => {
    for (let chunk = chunks.shift(); chunk; chunk = chunks.shift()) await ask(chunk);
  };
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));
  return { picks, asked: items.length };
}

export type AiApplied = { lines: QuoteLine[]; changed: number; rejected: number };

/**
 * Apply the AI's answers, leaving alone the lines edited meanwhile:
 * - the rules' model confirmed: unchanged ("Confirmé par l'IA" on lines that were to check);
 * - another model picked: it replaces the rules' one (configuration re-resolved from the text) and the
 *   line is "À vérifier" until the user confirms it;
 * - no candidate fits: a model the rules had picked is removed and the line is "Non reconnu", the
 *   rules' pick kept in a warning so it can be put back.
 */
export function applyAi(lines: QuoteLine[], picks: Map<string, string | null>): AiApplied {
  let changed = 0;
  let rejected = 0;
  const out = lines.map((l): QuoteLine => {
    const text = askText(l);
    if (!needsAi(l) || !text || !picks.has(text)) return l;
    const pick = picks.get(text) ?? undefined;
    const auto = { ...l.auto!, ai: { refId: pick } };
    const rulesPick = l.refId ? `${l.brand} ${l.model}` : undefined;
    if (pick === l.refId) return { ...l, auto, aiNote: l.refId && l.status !== "matched" ? "confirmed" : undefined };
    const ref = pick ? getRef(pick) : undefined;
    if (pick && !ref) return { ...l, auto }; // not a catalogue id: ignore the answer
    if (!ref) {
      rejected++;
      return {
        ...l, auto, aiNote: "rejected", refId: undefined, category: undefined, brand: "", model: l.sampleText, variant: {},
        status: "unmatched", warnings: [`Les règles proposaient ${rulesPick}`], priceState: "idle", agentResults: [],
      };
    }
    changed++;
    const m = matchAgainst({ row: 0, text: l.sampleText, quantity: l.quantity }, ref);
    return {
      ...l, auto, aiNote: "picked", refId: ref.id, category: ref.category, brand: ref.brand, model: ref.model, variant: m.variant,
      status: "review", warnings: [...(rulesPick ? [`Les règles proposaient ${rulesPick}`] : []), ...m.warnings], priceState: "idle", agentResults: [],
    };
  });
  return { lines: out, changed, rejected };
}

/**
 * Run the AI check in the background once the lines are on screen, and apply its answers to the draft
 * if the same lines are still there (`run` changes when the lines are matched again).
 */
export function startAi(lines: QuoteLine[], run: number, setDraft: Dispatch<SetStateAction<Draft>>, minMs = AI_MIN_MS) {
  const start = performance.now();
  const progress = (done: number, total: number) =>
    setDraft((d) => (d.ai?.run !== run || d.ai.state !== "running" ? d : { ...d, ai: { ...d.ai, done, total } }));
  askAi(lines, progress).then(
    async ({ picks, asked }) => {
      // Let the bar finish filling before the table changes.
      const wait = asked ? minMs - (performance.now() - start) : 0;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setDraft((d) => {
        if (d.ai?.run !== run) return d;
        const { lines, changed, rejected } = applyAi(d.lines, picks);
        return { ...d, lines, ai: { run, state: "done", asked, changed, rejected, ms: performance.now() - start } };
      });
    },
    (e: unknown) =>
      setDraft((d) => (d.ai?.run !== run ? d : { ...d, ai: { run, state: "error", asked: 0, changed: 0, rejected: 0, error: e instanceof Error ? e.message : String(e) } })),
  );
}
