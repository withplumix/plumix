import type { ConnectedCdn, Logger } from "plumix";
import type { CloudflareCdnConfig } from "plumix/cdn/cloudflare";
import { entryPurgeTags } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness } from "plumix/test";
import { describeCdnContract } from "plumix/test/conformance";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { WorkersCache } from "./cdn.js";
import { bindWorkersCache, cloudflare } from "./cdn.js";

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
 * the stubbed `fetch`; Workers Caching is the recording fake bound per test.
 */
let purge: ReturnType<typeof vi.fn<WorkersCache["purge"]>>;
let zoneFetch: ReturnType<typeof vi.fn<typeof fetch>>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  purge = vi.fn<WorkersCache["purge"]>(() =>
    Promise.resolve({ success: true, errors: [] }),
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
  logger?: Logger,
): Promise<number> {
  const h = await createDispatcherHarness({
    cdn,
    config: { plugins: [blog] },
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
  test("publishing an entry purges Workers Caching once with its tags, beside the zone", async () => {
    bindWorkersCache({ purge });

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

  test("purgeAll purges Workers Caching of everything, beside the zone", async () => {
    bindWorkersCache({ purge });

    await connect().purgeAll?.();

    expect(purge.mock.calls).toEqual([[{ purgeEverything: true }]]);
    expect(zonePurges()).toEqual([{ purge_everything: true }]);
  });

  test("with Workers Caching off, purgeAll purges only the zone", async () => {
    await connect().purgeAll?.();

    expect(purge).not.toHaveBeenCalled();
    expect(zonePurges()).toEqual([{ purge_everything: true }]);
  });

  test("1,500 tags become two Workers Caching purges, the most it takes being 1,000", async () => {
    bindWorkersCache({ purge });
    const tags = Array.from({ length: 1500 }, (_, i) => `e:${String(i)}`);

    await connect().purgeTags?.(tags);

    expect(purge.mock.calls).toEqual([
      [{ tags: tags.slice(0, 1000) }],
      [{ tags: tags.slice(1000) }],
    ]);
  });

  test("a refused Workers Caching purge is logged with its errors and the publish still succeeds", async () => {
    bindWorkersCache({
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

    await publishPost(connect(), logger);

    expect(logged).toEqual([
      expect.stringContaining("1134 rate limited") as string,
    ]);
  });
});

describe("with Workers Caching bound", () => {
  beforeEach(() => {
    bindWorkersCache({ purge });
  });

  describeCdnContract({ connect, purgeTags: true, purgeAll: true });
});
