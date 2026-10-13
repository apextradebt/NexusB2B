import { postJson } from "@/lib/api";
import { identifierIn } from "@/lib/identify";
import { detectLayout } from "@/lib/parse";
import type { Draft } from "@/lib/store";
import type { AbsorbedLine, AutoMatch, QuoteLine } from "@/types";

/*
 * Recognition feedback: for every line of a quote, what the rules (and the AI) found and what the user
 * kept, plus the columns whose role the user changed. The backend keeps one document per quote, replaced
 * on every send, to measure how often recognition is right on real lots and to build a test set from them.
 */

/** Identifies a quote in the feedback (not its saved id: a quote can be fed back without being saved). */
export const newQuoteId = () => `Q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

declare const __APP_COMMIT__: string | undefined;
const APP_VERSION = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";

/** Serial numbers and IMEIs identify a customer's device and say nothing about the model's name. */
export function redact(text: string): string {
  const id = identifierIn(text);
  if (id) return id.kind === "imei" ? "[imei]" : "[n° de série]";
  return text.replace(/\b\d{14,16}\b/g, "[imei]").replace(/\b\d{2}[\s-]\d{6}[\s-]\d{6}[\s-]?\d\b/g, "[imei]");
}

type Final = { refId: string | null; variant: QuoteLine["variant"]; removed: boolean };

const entry = (sampleText: string, rows: number, auto: AutoMatch, edited: boolean | undefined, final: Final) => ({
  text: redact(sampleText),
  rows,
  rules: { refId: auto.refId ?? null, status: auto.status, score: auto.score, variant: auto.variant },
  ...(auto.ai ? { ai: { refId: auto.ai.refId ?? null } } : {}),
  final,
  edited: !!edited,
});

/** One entry per recognised line, including lines merged into others and lines deleted by the user. */
function feedbackLines(lines: QuoteLine[], removed: boolean) {
  return lines.flatMap((l) => {
    const final: Final = { refId: l.refId ?? null, variant: l.variant, removed };
    const own = l.auto ? [entry(l.sampleText, l.sourceRows.length, l.auto, l.edited, final)] : [];
    const merged = (l.absorbed ?? []).filter((a): a is AbsorbedLine & { auto: AutoMatch } => !!a.auto)
      .map((a) => entry(a.sampleText, a.rows, a.auto, a.edited, final));
    return [...own, ...merged];
  });
}

/** Columns whose role the user changed from the detected one, with a few example values. */
function columnChanges(draft: Draft) {
  if (!draft.table || !draft.layout) return [];
  const detected = detectLayout(draft.table).mapping;
  return draft.table.headers.flatMap((header, i) => {
    const chosen = draft.layout!.mapping[header];
    if (!chosen || detected[header] === chosen) return [];
    const samples = draft.table!.rows.map((r) => r[i]).filter(Boolean).slice(0, 3).map((v) => redact(v).slice(0, 80));
    return [{ header, samples, detected: detected[header], chosen }];
  });
}

export function buildFeedback(draft: Draft) {
  return {
    quoteId: draft.id,
    fileName: draft.fileName,
    appVersion: APP_VERSION,
    // The backend takes 3000 lines per quote.
    lines: [...feedbackLines(draft.lines, false), ...feedbackLines(draft.removed ?? [], true)].slice(0, 3000),
    columns: columnChanges(draft),
  };
}

/** Send the quote's feedback in the background; failures are only logged. */
export function sendFeedback(draft: Draft) {
  if (!draft.id) return;
  const body = buildFeedback(draft);
  if (body.lines.length === 0 && body.columns.length === 0) return;
  postJson("/api/b2b/match-feedback", body)
    .then((res) => { if (!res.ok) console.warn(`Recognition feedback not saved (HTTP ${res.status})`); })
    .catch((e) => console.warn("Recognition feedback not sent:", e));
}
