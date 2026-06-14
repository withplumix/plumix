import { afterEach, describe, expect, test, vi } from "vitest";

import type { Entry } from "../db/schema/entries.js";
import { requestStore } from "../context/stores.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createRpcHarness } from "../test/rpc.js";
import { registerCoreSitemapInvalidator } from "./register-sitemap-invalidator.js";
import {
  bumpSitemapVersion,
  cachedSubSitemap,
  readSitemapVersion,
} from "./sitemap-cache.js";
import { handleSubSitemap, renderSubSitemap } from "./sitemap.js";

// In-memory stand-in for the Cloudflare Cache API (`caches.default`). It
// ignores `Cache-Control` TTLs — the tests drive invalidation through the
// version bump (which deletes the pointer), never through clock expiry.
class FakeCache {
  readonly store = new Map<string, Response>();
  putCount = 0;
  private key(req: RequestInfo | URL): string {
    return typeof req === "string" ? req : (req as Request).url;
  }
  match(req: RequestInfo | URL): Promise<Response | undefined> {
    const hit = this.store.get(this.key(req));
    return Promise.resolve(hit?.clone());
  }
  put(req: RequestInfo | URL, res: Response): Promise<void> {
    this.putCount += 1;
    this.store.set(this.key(req), res.clone());
    return Promise.resolve();
  }
  delete(req: RequestInfo | URL): Promise<boolean> {
    return Promise.resolve(this.store.delete(this.key(req)));
  }
}

function stubCaches(): FakeCache {
  const cache = new FakeCache();
  vi.stubGlobal("caches", { default: cache });
  return cache;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSitemapVersion / bumpSitemapVersion", () => {
  test("version starts at 0 and bumps monotonically in D1", async () => {
    const h = await createRpcHarness();
    expect(await readSitemapVersion(h.context)).toBe(0);

    await bumpSitemapVersion(h.context);
    expect(await readSitemapVersion(h.context)).toBe(1);

    await bumpSitemapVersion(h.context);
    expect(await readSitemapVersion(h.context)).toBe(2);
  });
});

describe("cachedSubSitemap", () => {
  test("regenerates on every request when no Cache API is present", async () => {
    const h = await createRpcHarness();
    const generate = vi.fn(() =>
      Promise.resolve(new Response(renderSubSitemap([]))),
    );

    await cachedSubSitemap(h.context, "post", 1, generate);
    await cachedSubSitemap(h.context, "post", 1, generate);

    expect(generate).toHaveBeenCalledTimes(2);
  });

  test("serves repeat requests from the cache (generates once)", async () => {
    const h = await createRpcHarness();
    stubCaches();
    let calls = 0;
    const generate = (): Promise<Response> => {
      calls += 1;
      return Promise.resolve(
        new Response(renderSubSitemap([{ loc: `https://x/post/n${calls}` }])),
      );
    };

    const first = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();
    const second = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();

    expect(calls).toBe(1);
    expect(first).toContain("https://x/post/n1");
    expect(second).toBe(first);
  });

  test("a cache hit issues no D1 query", async () => {
    const h = await createRpcHarness();
    stubCaches();
    const generate = (): Promise<Response> =>
      Promise.resolve(new Response(renderSubSitemap([])));

    // Warm the cache (and the version pointer) on the first request.
    await cachedSubSitemap(h.context, "post", 1, generate);

    const select = vi.spyOn(h.context.db, "select");
    await cachedSubSitemap(h.context, "post", 1, generate);

    expect(select).not.toHaveBeenCalled();
  });

  test("a version bump makes the next request regenerate", async () => {
    const h = await createRpcHarness();
    const cache = stubCaches();
    let calls = 0;
    const generate = (): Promise<Response> => {
      calls += 1;
      return Promise.resolve(
        new Response(renderSubSitemap([{ loc: `https://x/post/n${calls}` }])),
      );
    };

    const before = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();

    await bumpSitemapVersion(h.context);

    const after = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();

    expect(calls).toBe(2);
    expect(before).toContain("n1");
    expect(after).toContain("n2");
    // The stale v0 entry lingers (no per-key purge) — it's just unreachable.
    expect(cache.store.size).toBeGreaterThan(1);
  });
});

describe("handleSubSitemap", () => {
  test("serves repeat requests from the cache without re-querying", async () => {
    const h = await createRpcHarness();
    const cache = stubCaches();

    await handleSubSitemap(h.context, "post", 1);
    const putsAfterMiss = cache.putCount;
    await handleSubSitemap(h.context, "post", 1);

    expect(putsAfterMiss).toBeGreaterThan(0);
    expect(cache.putCount).toBe(putsAfterMiss);
  });

  test("publishing an entry retires the cache so the next sitemap reflects it", async () => {
    const h = await createRpcHarness();
    registerCoreSitemapInvalidator(h.hooks);
    stubCaches();
    const author = await h.factory.user.create();
    const generate = async (): Promise<Response> => {
      const rows = await h.context.db
        .select({ slug: entries.slug })
        .from(entries)
        .where(eq(entries.status, "published"));
      return new Response(
        renderSubSitemap(
          rows.map((r) => ({ loc: `https://x/post/${r.slug}` })),
        ),
      );
    };

    await h.factory.published.create({ authorId: author.id, slug: "first" });
    const before = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();
    expect(before).toContain("/post/first");
    expect(before).not.toContain("/post/second");

    await h.factory.published.create({ authorId: author.id, slug: "second" });
    await requestStore.run(h.context, () =>
      h.hooks.doAction("entry:published", { id: 2 } as unknown as Entry),
    );

    const after = await (
      await cachedSubSitemap(h.context, "post", 1, generate)
    ).text();
    expect(after).toContain("/post/second");
  });
});
