/**
 * Run lot files through the rules, then ask the local model (Ollama) about the lines the rules did not
 * settle, and print what it would change. A quick way to judge the model on real supplier files.
 *
 *   npx tsx training/check-lots.ts test-data/lot-mac-pc-phone.csv [more files…]
 *
 * Serial numbers are not looked up here (that needs the backend), so lines naming a device only by
 * its serial number are left out.
 */
import { readFileSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { candidatesFor } from "@/lib/aiMatch";
import { identifierIn } from "@/lib/identify";
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

async function ask(text: string, names: string[]): Promise<number> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, keep_alive: "1h", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(text, names) }], options: { temperature: 0, num_predict: 4 } }),
  });
  if (!res.ok) throw new Error(`Ollama: HTTP ${res.status} ${await res.text()}`);
  return Number(((await res.json()).message.content as string).match(/\d+/)?.[0] ?? 0);
}

for (const file of process.argv.slice(2)) {
  const table = await load(file);
  const lines = buildLines(table, detectLayout(table)).filter((l) => !identifierIn(l.text));
  const uncertain = lines.map((l) => ({ l, m: matchLine(l) })).filter(({ m }) => m.status !== "matched");
  console.log(`\n${file}: ${lines.length} lines, ${uncertain.length} not settled by the rules`);
  const start = performance.now();
  for (const { l, m } of uncertain) {
    const cands = candidatesFor(l.text);
    const n = cands.length ? await ask(l.text, cands.map((c) => `${c.brand} ${c.model}`)) : 0;
    const pick = n >= 1 && n <= cands.length ? `${cands[n - 1].brand} ${cands[n - 1].model}` : "—";
    const rules = m.ref ? `${m.status}: ${m.ref.model}` : m.status;
    console.log(`  ${l.text.slice(0, 60).padEnd(60)}  rules ${rules.padEnd(32)}  model ${pick}`);
  }
  if (uncertain.length) console.log(`  (${Math.round((performance.now() - start) / uncertain.length)} ms per line, one at a time)`);
}
