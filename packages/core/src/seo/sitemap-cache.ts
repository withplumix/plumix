import { sql } from "drizzle-orm";

import type { AppContext } from "../context/app.js";
import { and, eq } from "../db/index.js";
import { settings } from "../db/schema/settings.js";

// The version token lives in a `settings` row — D1 is strongly consistent
// and already on every `ctx`, so a bump is visible to every isolate on its
// next read. The token is embedded in the Cache API key, so bumping it makes
// every prior sub-sitemap unreachable without a per-key purge (which the
// Cache API doesn't offer).
const VERSION_GROUP = "seo";
const VERSION_KEY = "sitemap_version";

// Synthetic, never-routed cache keys. The version pointer carries a short TTL
// so each colo re-reads D1 at most once per window (a bump also deletes it for
// immediate convergence in the writing colo); sub-sitemap bodies are keyed by
// version, so a bump retires them logically (an old-version body lingers,
// unreachable, until the platform evicts it).
const CACHE_ORIGIN = "https://sitemap.plumix.internal";
const VERSION_POINTER = `${CACHE_ORIGIN}/version`;
const VERSION_POINTER_TTL_SECONDS = 60;

// Minimal shape of the Cloudflare Cache API (`caches.default`); typed locally
// so core stays free of `@cloudflare/workers-types`.
interface SitemapCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
}

function cacheStore(): SitemapCache | null {
  const store = (globalThis as { caches?: { default?: SitemapCache } }).caches;
  return store?.default ?? null;
}

function subSitemapKey(scope: string, page: number, version: number): string {
  return `${CACHE_ORIGIN}/sitemap-${scope}-${String(page)}.xml?v=${String(version)}`;
}

/**
 * Read the current sitemap version straight from D1. The source of truth;
 * `currentSitemapVersion` layers a Cache-API pointer over this to keep the
 * read off D1 on the hot path.
 */
export async function readSitemapVersion(ctx: AppContext): Promise<number> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(
      and(eq(settings.group, VERSION_GROUP), eq(settings.key, VERSION_KEY)),
    );
  return typeof row?.value === "number" ? row.value : 0;
}

/**
 * Increment the version so every cached sub-sitemap key goes stale. Fired by
 * the lifecycle-action subscriber on entry/term mutations. The increment is a
 * single SQL statement, so concurrent bumps can't lose an increment.
 */
export async function bumpSitemapVersion(ctx: AppContext): Promise<void> {
  await ctx.db
    .insert(settings)
    .values({ group: VERSION_GROUP, key: VERSION_KEY, value: 1 })
    .onConflictDoUpdate({
      target: [settings.group, settings.key],
      set: { value: sql`${settings.value} + 1` },
    });
  // Drop this colo's pointer so it re-reads the bumped version immediately;
  // other colos converge when their pointer TTL lapses.
  await cacheStore()?.delete(VERSION_POINTER);
}

/**
 * The version to key cache entries by. Reads a Cache-API pointer first so the
 * hot path stays off D1; falls back to D1 (and re-seeds the pointer) on a
 * pointer miss, or straight to D1 when no Cache API is available.
 */
async function currentSitemapVersion(ctx: AppContext): Promise<number> {
  const store = cacheStore();
  if (!store) return readSitemapVersion(ctx);

  const pointer = await store.match(VERSION_POINTER);
  if (pointer) {
    const parsed = Number(await pointer.text());
    if (Number.isFinite(parsed)) return parsed;
  }

  const version = await readSitemapVersion(ctx);
  await store.put(
    VERSION_POINTER,
    new Response(String(version), {
      headers: {
        "cache-control": `max-age=${String(VERSION_POINTER_TTL_SECONDS)}`,
      },
    }),
  );
  return version;
}

/**
 * Serve a sub-sitemap from the Cache API, keyed by `scope+page+version`, only
 * regenerating on a miss. Falls back to per-request generation when no Cache
 * API is present (tests, non-Workers runtimes).
 */
export async function cachedSubSitemap(
  ctx: AppContext,
  scope: string,
  page: number,
  generate: () => Promise<Response>,
): Promise<Response> {
  const store = cacheStore();
  if (!store) return generate();

  const version = await currentSitemapVersion(ctx);
  const key = subSitemapKey(scope, page, version);

  const hit = await store.match(key);
  if (hit) return hit;

  const fresh = await generate();
  await store.put(key, fresh.clone());
  return fresh;
}
