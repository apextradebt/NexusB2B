import { createServer } from "node:http";
import { price } from "./engine.ts";
import { SOURCES } from "./sources/index.ts";
import type { Query } from "./types.ts";

/**
 * Price agents API for the B2B quoting tool.
 *   POST /api/price   { category, brand, model, cpu?, ram?, storage?, grade } → prices per source
 *   GET  /api/sources → the configured sources
 */
const PORT = Number(process.env.PORT || 8787);

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  try {
    if (req.method === "GET" && req.url === "/api/sources") {
      return send(200, SOURCES.map(({ id, name, country, site, kinds, categories }) => ({ id, name, country, site, kinds, categories })));
    }
    if (req.method === "POST" && req.url === "/api/price") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const q = JSON.parse(body) as Query;
      if (!q.model || !q.category || !q.grade) return send(400, { error: "category, model et grade sont requis" });
      const t0 = Date.now();
      const result = await price(q);
      console.log(`${q.category} ${q.brand} ${q.model} ${q.cpu ?? ""} ${q.storage ?? ""} ${q.grade} → ${result.prices.length} prix en ${Date.now() - t0} ms`);
      return send(200, result);
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(500, { error: (e as Error).message });
  }
});

server.listen(PORT, () => console.log(`Price agents listening on http://localhost:${PORT} (${SOURCES.length} sources)`));
