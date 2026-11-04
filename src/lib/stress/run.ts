import { buildLines, decode, detectLayout, parseText, toTable, type Table } from "@/lib/parse";
import { matchLine } from "@/lib/match";
import { groupLines } from "@/lib/group";
import type { Grade, QuoteLine } from "@/types";
import type { StressList, Truth } from "@/lib/stress/types";

export type Issue = { kind: IssueKind; units: number; expected: string; got: string; text?: string };
export type IssueKind = "wrong_model_silent" | "wrong_model_flagged" | "unrecognised" | "wrong_grade" | "wrong_storage" | "wrong_ram" | "wrong_cpu" | "lost_units" | "extra_units" | "false_positive";

export type Result = { name: string; family: string; units: number; correct: number; toReview: number; junk: number; issues: Issue[]; mapping?: Record<string, string> };

const table = (l: StressList): Table => {
  if (l.matrix) return toTable(l.matrix.map((r) => r.map((c) => String(c))));
  return parseText(l.text ?? decode(l.bytes!));
};

type Got = { model?: string; storage?: string; ram?: string; cpu?: string; grade?: Grade; left: number; status: QuoteLine["status"]; text: string };

// "1000GB" and "1024GB" are 1TB whatever the list wrote.
const cap = (s?: string) => (s ? s.replace(/^(?:1000|1024)GB$/, "1TB").replace(/^(?:2000|2048)GB$/, "2TB") : s);
const show = (x: { model?: string; storage?: string; ram?: string; cpu?: string; grade?: string }) =>
  [x.model ?? "?", x.cpu, x.ram, x.storage, x.grade && `grade ${x.grade}`].filter(Boolean).join(" ");

const FIELDS = ["storage", "ram", "cpu", "grade"] as const;
const differs = (e: Truth, g: Got) => FIELDS.filter((f) => e[f] !== undefined && cap(e[f]) !== cap(g[f]));

/** The real import path, without the two network steps (serial lookup, AI check): what the parser and the matcher do alone. */
export function runList(l: StressList): Result {
  const t = table(l);
  const layout = detectLayout(t);
  const raw = buildLines(t, layout);
  const lines = groupLines(raw, raw.map(matchLine), "C");
  const got: Got[] = lines.map((q) => ({
    model: q.status === "unmatched" ? undefined : q.model,
    storage: q.variant.storage,
    ram: q.variant.ram,
    cpu: q.variant.cpu,
    grade: q.gradeAssumed ? undefined : q.grade,
    left: q.quantity,
    status: q.status,
    text: q.sampleText,
  }));
  const want = l.truth.filter((e) => e.model).map((e) => ({ ...e, left: e.qty }));
  const traps = l.truth.filter((e) => !e.model).reduce((n, e) => n + e.qty, 0);
  const units = want.reduce((n, e) => n + e.qty, 0);
  const issues: Issue[] = [];
  let correct = 0;
  let toReview = 0;

  // 1. Right on every point the list gives.
  for (const e of want) for (const g of got) {
    if (!e.left || !g.left || g.model !== e.model || differs(e, g).length) continue;
    const n = Math.min(e.left, g.left);
    e.left -= n;
    g.left -= n;
    correct += n;
    if (g.status === "review") toReview += n;
  }
  // 2. Right model, a detail wrong.
  for (const e of want) for (const g of got) {
    if (!e.left || !g.left || g.model !== e.model) continue;
    const n = Math.min(e.left, g.left);
    e.left -= n;
    g.left -= n;
    for (const f of differs(e, g)) issues.push({ kind: `wrong_${f}` as IssueKind, units: n, expected: show(e), got: show(g), text: g.text });
  }
  // 3. Another model, or nothing, in its place: the leftovers are paired in order.
  for (const e of want) for (const g of got) {
    if (!e.left || !g.left) continue;
    const n = Math.min(e.left, g.left);
    e.left -= n;
    g.left -= n;
    const kind: IssueKind = g.status === "matched" ? "wrong_model_silent" : g.status === "review" ? "wrong_model_flagged" : "unrecognised";
    issues.push({ kind, units: n, expected: show(e), got: show(g), text: g.text });
  }
  for (const e of want) if (e.left) issues.push({ kind: "lost_units", units: e.left, expected: show(e), got: "-" });

  // 4. What is left was not asked for.
  let junk = 0;
  let trapped = traps;
  for (const g of got) {
    if (!g.left) continue;
    if (g.status === "unmatched") {
      const n = Math.min(trapped, g.left);
      trapped -= n;
      junk += g.left - n;
    } else {
      issues.push({ kind: traps ? "false_positive" : "extra_units", units: g.left, expected: "-", got: show(g), text: g.text });
    }
  }
  return { name: l.name, family: l.family, units, correct, toReview, junk, issues, mapping: layout.mapping };
}
