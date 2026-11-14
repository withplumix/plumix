import type { ConnectedCdn, Logger, TelemetrySnapshot } from "plumix";
import type { CloudflareCdnConfig } from "plumix/cdn/cloudflare";
import { entryPurgeTags } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { runScheduledTasks } from "plumix/runtime";
import { entries } from "plumix/schema";
import { createDispatcherHarness, createTestContext } from "plumix/test";
import { describeCdnContract } from "plumix/test/conformance";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { WorkersCache } from "./cdn.js";
import { bindWorkersCache, cloudflare } from "./cdn.js";
import { forwardedByGateway, sharedCacheRequest } from "./shared-cache.js";

const CONFIG: CloudflareCdnConfig = {
  ttl: 60,
  zoneId: "zone-1",
  purgeToken: "token-1",
};

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

/**
 * The suite runs on Node, so `caches.default` is absent and the zone purge is
 * the stubbed `fetch`. The cached entrypoint's `purge` is a recording fake.
 */
let purge: ReturnType<typeof vi.fn<WorkersCache["purge"]>>;
let entrypointFetch: ReturnType<typeof vi.fn<WorkersCache["fetch"]>>;
let zoneFetch: ReturnType<typeof vi.fn<typeof fetch>>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  purge = vi.fn<WorkersCache["purge"]>(() =>
    Promise.resolve({ success: true, errors: [] }),
  );
  entrypointFetch = vi.fn<WorkersCache["fetch"]>(() =>
    Promise.resolve(new Response("from the cached entrypoint")),
  );
  zoneFetch = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 200 })),
  );
  globalThis.fetch = zoneFetch;
});

afterEach(() => {
  bindWorkersCache(null);
  globalThis.fetch = originalFetch;
});

function connect(): ConnectedCdn {
  const cdn = cloudflare(CONFIG).connect({});
  if (cdn === null) throw new Error("expected a connected cdn");
  return cdn;
}

function zonePurges(): unknown[] {
  return zoneFetch.mock.calls.map(
    ([, init]) => JSON.parse(init?.body as string) as unknown,
  );
}

async function publishPost(
  cdn: ConnectedCdn,
  options: {
    readonly logger?: Logger;
    readonly snapshots?: TelemetrySnapshot[];
  } = {},
): Promise<number> {
  const { logger, snapshots } = options;
  const h = await createDispatcherHarness({
    cdn,
    config: {
      plugins: [blog],
      ...(snapshots === undefined
        ? {}
        : {
            telemetry: {
              consumers: [
                {
                  id: "probe",
                  onRequestEnd: (snapshot) => {
                    snapshots.push(snapshot);
                  },
                },
              ],
            },
          }),
    },
    ...(logger === undefined ? {} : { logger }),
  });
  const admin = await h.seedUser("admin");
  const created = await h.fetch("/_plumix/rpc/entry/create", {
    as: admin,
    json: {
      json: {
        type: "post",
        title: "Hello",
        slug: "hello",
        status: "published",
      },
      meta: [],
    },
  });
  created.assertStatus(200);
  await h.drainDeferred();
  const [entry] = await h.db.select({ id: entries.id }).from(entries);
  return entry?.id ?? 0;
}

describe("cloudflare() from the Cloudflare runtime", () => {
  test("publishing an entry purges the cached entrypoint once with its tags, beside the zone", async () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });

    const id = await publishPost(connect());

    const tags = entryPurgeTags("post", id);
    expect(purge.mock.calls).toEqual([[{ tags }]]);
    expect(zonePurges()).toEqual([{ tags }]);
  });

  test("with Workers Caching off, a publish purges only the zone", async () => {
    const id = await publishPost(connect());

    expect(purge).not.toHaveBeenCalled();
    expect(zonePurges()).toEqual([{ tags: entryPurgeTags("post", id) }]);
  });

  test("purgeAll purges the cached entrypoint of everything, beside the zone", async () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });

    await connect().purgeAll?.();

    expect(purge.mock.calls).toEqual([[{ purgeEverything: true }]]);
    expect(zonePurges()).toEqual([{ purge_everything: true }]);
  });

  test("a scheduled publish purges the cached entrypoint with the entry's tags", async () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });
    const h = await createDispatcherHarness({
      config: { plugins: [blog] },
    });
    const author = await h.seedUser("admin");
    const due = await h.factory.entry.create({
      type: "post",
      status: "scheduled",
      publishedAt: new Date("2020-01-01T00:00:00Z"),
      authorId: author.id,
    });
    const deferred: Promise<unknown>[] = [];
    const ctx = createTestContext({
      db: h.db,
      handlers: h.app.handlers,
      plugins: h.app.plugins,
      cdn: connect(),
      defer: (promise) => {
        deferred.push(promise);
      },
    });

    await runScheduledTasks(h.app, ctx, "*/5 * * * *");
    await Promise.all(deferred);

    expect(purge.mock.calls).toEqual([
      [{ tags: entryPurgeTags("post", due.id) }],
    ]);
  });

  test("with Workers Caching off, purgeAll purges only the zone", async () => {
    await connect().purgeAll?.();

    expect(purge).not.toHaveBeenCalled();
    expect(zonePurges()).toEqual([{ purge_everything: true }]);
  });

  test("1,500 tags become two Workers Caching purges, the most it takes being 1,000", async () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });
    const tags = Array.from({ length: 1500 }, (_, i) => `e:${String(i)}`);

    await connect().purgeTags?.(tags);

    expect(purge.mock.calls).toEqual([
      [{ tags: tags.slice(0, 1000) }],
      [{ tags: tags.slice(1000) }],
    ]);
  });

  test("a refused Workers Caching purge is logged with its errors and the publish still succeeds", async () => {
    bindWorkersCache({
      fetch: entrypointFetch,
      purge: () =>
        Promise.resolve({
          success: false,
          errors: [{ code: 1134, message: "rate limited" }],
        }),
    });
    const logged: string[] = [];
    const logger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: (message) => logged.push(message),
    };

    await publishPost(connect(), { logger });

    expect(logged).toEqual([
      expect.stringContaining("1134 rate limited") as string,
    ]);
  });

  test("a refused Workers Caching purge lands on the request's cdn telemetry record", async () => {
    const errors = [{ code: 1134, message: "rate limited" }];
    bindWorkersCache({
      fetch: entrypointFetch,
      purge: () => Promise.resolve({ success: false, errors }),
    });
    const snapshots: TelemetrySnapshot[] = [];

    await publishPost(connect(), { snapshots });

    const cdnRecords = snapshots.flatMap(
      (snapshot) => snapshot.records.cdn ?? [],
    );
    expect(cdnRecords).toEqual([
      expect.objectContaining({
        data: { purge: "workers-caching", success: false, errors },
      }),
    ]);
  });
});

describe("the front cache", () => {
  test("reads a signed-in reader's copy from the cached entrypoint, as the gateway forwards", async () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });

    const copy = await connect().frontCache?.read(
      new Request("https://site.example/soup?utm_source=x&b=2&a=1", {
        headers: { cookie: "plumix_session=alice" },
      }),
    );

    expect(await copy?.text()).toBe("from the cached entrypoint");
    const forwarded = entrypointFetch.mock.calls[0]?.[0];
    if (forwarded === undefined) throw new Error("expected a forwarded call");
    expect(forwarded.url).toBe("https://site.example/soup?a=1&b=2");
    expect(forwarded.headers.has("cookie")).toBe(false);
    expect(forwardedByGateway(forwarded)).toBe(true);
  });

  test("recognizes only a request the gateway forwarded", () => {
    bindWorkersCache({ purge, fetch: entrypointFetch });
    const cdn = connect();

    expect(
      cdn.frontCache?.forwarded(
        sharedCacheRequest(new Request("https://site.example/soup")),
      ),
    ).toBe(true);
    expect(
      cdn.frontCache?.forwarded(new Request("https://site.example/soup")),
    ).toBe(false);
  });

  test("is absent with Workers Caching off", () => {
    expect(connect().frontCache).toBeUndefined();
  });
});

describe("with Workers Caching bound", () => {
  beforeEach(() => {
    bindWorkersCache({ purge, fetch: entrypointFetch });
  });

  describeCdnContract({ connect, purgeTags: true, purgeAll: true });
});
