/**
 * Run lot files through the whole recognition as the app does it (rules, then the local model on every
 * line, then applyAi) and print the lines where the AI's answer leaves the row worse: a model picked
 * with a configuration the text gave but the row lost, a model the rules had right taken away, etc.
 *
 *   npx tsx training/audit-ai.ts test-data/*.csv test-data/ai-demo/* [more files…]
 *
 * Talks to Ollama directly (same prompt as the backend). Serial numbers are not looked up.
 */
import { readFileSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { applyAi, askAi } from "@/lib/aiMatch";
import { getRef } from "@/lib/catalog";
import { groupLines } from "@/lib/group";
import { matchLine } from "@/lib/match";
import { buildLines, decode, detectLayout, parseText, toTable, type Table } from "@/lib/parse";
import { SYSTEM, buildPrompt } from "./format";

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.B2B_AI_MODEL || "nexus-matcher";

async function load(path: string): Promise<Table> {
  const buf = readFileSync(path);
  if (/\.xlsx$/i.test(path)) {
    const sheets = (await readXlsxFile(buf)) as unknown as { data: unknown[][] }[];
    return toTable(sheets[0].data.map((r) => r.map((c) => (c == null ? "" : String(c)))));
  }
  return parseText(decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
}

// The backend route, answered straight from Ollama.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (!String(url).endsWith("/api/b2b/resolve")) return realFetch(url, init);
  const { lines } = JSON.parse(String(init!.body)) as { lines: { text: string; candidates: { id: string; name: string }[] }[] };
  const picks = await Promise.all(lines.map(async (l) => {
    const res = await realFetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, stream: false, keep_alive: "1h", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(l.text, l.candidates.map((c) => c.name)) }], options: { temperature: 0, num_predict: 4 } }),
    });
    const n = Number(((await res.json()).message.content as string).match(/\d+/)?.[0] ?? 0);
    return n >= 1 && n <= l.candidates.length ? l.candidates[n - 1].id : null;
  }));
  return new Response(JSON.stringify({ picks, failed: [] }), { status: 200 });
}) as typeof fetch;

const name = (id?: string) => (id ? `${getRef(id)!.brand} ${getRef(id)!.model}` : "—");
const cfg = (v: { cpu?: string; ram?: string; storage?: string }) => [v.cpu, v.ram, v.storage].map((x) => x ?? "?").join("/");
const filled = (v: { cpu?: string; ram?: string; storage?: string }) => [v.cpu, v.ram, v.storage].filter(Boolean).length;

let total = 0;
const tally: Record<string, number> = {};
for (const file of process.argv.slice(2)) {
  const table = await load(file);
  const raw = buildLines(table, detectLayout(table));
  const lines = groupLines(raw, raw.map(matchLine), "B");
  const { picks } = await askAi(lines);
  const { lines: after } = applyAi(lines, picks);
  const byKey = new Map(after.map((l) => [l.key, l]));
  console.log(`\n${file}: ${lines.length} lines`);
  for (const before of lines) {
    const a = byKey.get(before.key)!;
    total++;
    const flags: string[] = [];
    if (a.aiNote === "picked" && a.refId && filled(a.variant) < filled(before.variant)) flags.push("CONFIG LOST");
    if (a.aiNote === "picked" && a.refId && a.category && filled(a.variant) === 0) flags.push("CONFIG BLANK");
    if (a.aiNote === "rejected") flags.push("REJECTED");
    if (a.aiNote === "picked") flags.push("PICKED");
    if (!a.refId && !a.auto?.ai) flags.push("NOT ASKED");
    if (!a.refId && a.auto?.ai && !a.aiNote) flags.push("AI NONE");
    for (const f of flags) tally[f] = (tally[f] ?? 0) + 1;
    if (!flags.length) continue;
    console.log(`  [${flags.join(", ")}] « ${before.sampleText.slice(0, 70)} »`);
    console.log(`      rules ${before.status.padEnd(9)} ${name(before.refId).padEnd(34)} ${cfg(before.variant)}`);
    console.log(`      after ${a.status.padEnd(9)} ${name(a.refId).padEnd(34)} ${cfg(a.variant)}  ${a.warnings.join(" · ")}`);
  }
}
console.log(`\n${total} lines`, tally);
