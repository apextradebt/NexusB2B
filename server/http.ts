/**
 * Polite HTTP layer shared by every source:
 * - robots.txt is honoured (Google-style wildcards, longest match wins); disallowed URLs are never fetched
 * - one request at a time per host, at least MIN_GAP_MS apart
 * - responses cached in memory for CACHE_TTL_MS, oldest pages evicted past CACHE_MAX_CHARS
 * - anti-bot walls (Cloudflare / DataDome challenge pages) are reported as "blocked", never worked around
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MIN_GAP_MS = 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 20000;

export class SourceError extends Error {
  constructor(public code: "robots" | "blocked" | "http" | "timeout" | "parse", message: string) {
    super(message);
  }
}

type Rule = { allow: boolean; pattern: string; re: RegExp };
const robotsCache = new Map<string, Promise<Rule[] | null>>();

function patternToRe(p: string) {
  const end = p.endsWith("$");
  const body = (end ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (end ? "$" : ""));
}

export function parseRobots(body: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur!.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      if ((key === "allow" || key === "disallow") && cur && val) cur.rules.push({ allow: key === "allow", pattern: val, re: patternToRe(val) });
      lastWasAgent = false;
    }
  }
  return groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
}

export function isAllowed(rules: Rule[] | null, pathAndQuery: string) {
  if (!rules) return true;
  let best: Rule | undefined;
  for (const r of rules) {
    if (!r.re.test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

async function robotsFor(origin: string) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetch(origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null; // no robots.txt → everything allowed
        return parseRobots(await res.text());
      } catch {
        return null;
      }
    })());
  }
  return robotsCache.get(origin)!;
}

// Hosts that rate-limit (HTTP 429) at one request per second. Keys are throttle groups (see throttleKey).
const HOST_GAP_MS: Record<string, number> = {
  "www.alternate.de": 8000,
  // rebuy's five storefronts share one rate limit.
  rebuy: 1500,
};
const throttleKey = (host: string) => (/(^|\.)rebuy\.[a-z]+$/.test(host) ? "rebuy" : host);
/** On HTTP 429, wait what the site asks (Retry-After, capped) and try once more before reporting "blocked". */
const RETRY_AFTER_MAX_MS = 30000;
/** A site still answering 429 after the retry is left alone for a while instead of being asked again. */
const COOLDOWN_MS = 15 * 60 * 1000;
const cooldownUntil = new Map<string, number>();
function checkCooldown(host: string) {
  const until = cooldownUntil.get(throttleKey(host)) ?? 0;
  if (Date.now() < until) throw new SourceError("blocked", `Limite de requêtes atteinte, site en pause jusqu'à ${new Date(until).toLocaleTimeString("fr-FR")}`);
}
const startCooldown = (host: string) => cooldownUntil.set(throttleKey(host), Date.now() + COOLDOWN_MS);

const lastHit = new Map<string, Promise<void>>();
function throttle(host: string) {
  const key = throttleKey(host);
  const prev = lastHit.get(key) ?? Promise.resolve();
  const next = prev.then(() => new Promise<void>((r) => setTimeout(r, HOST_GAP_MS[key] ?? MIN_GAP_MS)));
  lastHit.set(key, next);
  return prev;
}

const cache = new Map<string, { at: number; body: string }>();
// Product pages weigh up to ~1 MB each: without a cap a long-running server runs out of memory.
const CACHE_MAX_CHARS = 100_000_000;
let cacheChars = 0;
function remember(key: string, body: string) {
  const old = cache.get(key);
  if (old) {
    cacheChars -= old.body.length;
    cache.delete(key);
  }
  cache.set(key, { at: Date.now(), body });
  cacheChars += body.length;
  // Maps iterate in insertion order: evict the oldest pages first, keep sitemaps (slow to rebuild).
  for (const [k, v] of cache) {
    if (cacheChars <= CACHE_MAX_CHARS) break;
    if (k.startsWith("SITEMAP ")) continue;
    cache.delete(k);
    cacheChars -= v.body.length;
  }
}

const WALL = /(captcha-delivery|datadome|cf-chl-|challenge-platform|_Incapsula_|px-captcha|Just a moment\.\.\.|Attention Required! \| Cloudflare)/i;

export async function get(url: string, init: { headers?: Record<string, string>; method?: string; body?: string } = {}): Promise<string> {
  const u = new URL(url);
  const key = `${init.method || "GET"} ${url} ${init.body || ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;

  if (!isAllowed(await robotsFor(u.origin), u.pathname + u.search)) {
    throw new SourceError("robots", `robots.txt interdit ${u.pathname}`);
  }
  checkCooldown(u.host);
  const send = async () => {
    await throttle(u.host);
    try {
      return await fetch(url, {
        method: init.method || "GET",
        body: init.body,
        redirect: "follow",
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9,de;q=0.8,en;q=0.7", Accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new SourceError("timeout", `Réseau : ${(e as Error).message}`);
    }
  };
  let res = await send();
  if (res.status === 429) {
    const wait = Math.min(RETRY_AFTER_MAX_MS, (Number(res.headers.get("retry-after")) || 10) * 1000);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const body = await res.text();
  if (res.status === 429) startCooldown(u.host);
  if (res.status === 403 || res.status === 429 || WALL.test(body.slice(0, 20000))) {
    throw new SourceError("blocked", `Protection anti-robot (HTTP ${res.status})`);
  }
  if (!res.ok) throw new SourceError("http", `HTTP ${res.status}`);
  remember(key, body);
  return body;
}

/** Sitemaps are often gzipped: fetch as bytes (same robots/throttle rules) and gunzip when needed. */
export async function getSitemap(url: string): Promise<string[]> {
  const u = new URL(url);
  const hit = cache.get("SITEMAP " + url);
  if (hit && Date.now() - hit.at < SITEMAP_TTL_MS) return JSON.parse(hit.body);
  const saved = readSavedSitemap(url);
  if (saved) {
    remember("SITEMAP " + url, JSON.stringify(saved));
    return saved;
  }
  if (!isAllowed(await robotsFor(u.origin), u.pathname + u.search)) throw new SourceError("robots", `robots.txt interdit ${u.pathname}`);
  checkCooldown(u.host);
  const send = async () => {
    await throttle(u.host);
    return fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
  };
  let res = await send();
  if (res.status === 429) {
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, Math.min(RETRY_AFTER_MAX_MS, (Number(res.headers.get("retry-after")) || 10) * 1000)));
    res = await send();
  }
  if (res.status === 429) startCooldown(u.host);
  if (res.status === 403 || res.status === 429) throw new SourceError("blocked", `Protection anti-robot (HTTP ${res.status})`);
  if (!res.ok) throw new SourceError("http", `Sitemap HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = (await import("node:zlib")).gunzipSync(buf);
  const locs = [...buf.toString("utf8").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  remember("SITEMAP " + url, JSON.stringify(locs));
  saveSitemap(url, locs);
  return locs;
}

// Sitemaps are also kept on disk for a day, so restarting the server does not download them all again.
const SITEMAP_TTL_MS = 24 * 3600 * 1000;
const SITEMAP_DIR = join(import.meta.dirname, "..", ".cache", "sitemaps");
const sitemapFile = (url: string) => join(SITEMAP_DIR, createHash("sha1").update(url).digest("hex") + ".json");
function readSavedSitemap(url: string): string[] | undefined {
  try {
    const file = sitemapFile(url);
    if (Date.now() - statSync(file).mtimeMs > SITEMAP_TTL_MS) return undefined;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}
function saveSitemap(url: string, locs: string[]) {
  try {
    mkdirSync(SITEMAP_DIR, { recursive: true });
    writeFileSync(sitemapFile(url), JSON.stringify(locs));
  } catch {
    // Disk cache is an optimisation only.
  }
}

export async function getJson<T = unknown>(url: string, init?: Parameters<typeof get>[1]): Promise<T> {
  const body = await get(url, init);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SourceError("parse", "Réponse JSON invalide");
  }
}

// --- Currency: ECB reference rates (via frankfurter.app), refreshed daily ---
let fx: { at: number; rates: Record<string, number> } | null = null;
export async function toEur(amount: number, currency: string): Promise<number> {
  if (currency === "EUR") return amount;
  if (!fx || Date.now() - fx.at > 24 * 3600 * 1000) {
    try {
      const data = (await (await fetch("https://api.frankfurter.app/latest?from=EUR", { signal: AbortSignal.timeout(TIMEOUT_MS) })).json()) as { rates: Record<string, number> };
      fx = { at: Date.now(), rates: data.rates };
    } catch {
      fx = fx ?? { at: 0, rates: { USD: 1.1, GBP: 0.85, CHF: 0.95, SEK: 11.5, DKK: 7.46, NOK: 11.7 } };
    }
  }
  const rate = fx.rates[currency];
  return rate ? Math.round((amount / rate) * 100) / 100 : amount;
}
