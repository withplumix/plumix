import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { VisitorMetaOptions } from "./visitor-meta.js";
import { definePlugin } from "../plugin/define.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { createTracedContext } from "../test/traced-context.js";
import { eq } from "./index.js";
import { settings } from "./schema/settings.js";
import { readVisitorMeta } from "./visitor-meta.js";

const NAMESPACE = "spam_guard";
const HASH_ROUTE = "/visitor-hash";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("https://cms.example/submit", { method: "POST", headers });
}

/** One install, one visitor: the context a runtime builds for their request. */
function contextFor(
  db: TestDb,
  options: {
    readonly clientAddress?: string;
    readonly request?: Request;
  } = {},
): AppContext {
  return createTestContext({
    db,
    clientAddress: options.clientAddress,
    request: options.request ?? requestWith(),
  });
}

async function ipHashFor(ctx: AppContext): Promise<string> {
  const meta = await readVisitorMeta(ctx, { namespace: NAMESPACE });
  return meta.ipHash;
}

/**
 * The one route a plugin would write over `readVisitorMeta`, so a test reads
 * back what the whole request path — adapter fact to hashed bucket — produced.
 */
const echoVisitorHash = definePlugin("visitor_echo", (ctx) => {
  ctx.registerPublicRoute({
    path: HASH_ROUTE,
    handler: async (_request, appCtx) =>
      new Response(
        (await readVisitorMeta(appCtx, { namespace: NAMESPACE })).ipHash,
      ),
  });
});

async function hashThroughHarness(clientAddress?: string): Promise<{
  readonly harness: Awaited<ReturnType<typeof createDispatcherHarness>>;
  readonly hash: string;
}> {
  const harness = await createDispatcherHarness({
    plugins: [echoVisitorHash],
    clientAddress,
  });
  const response = await harness.fetch(HASH_ROUTE);
  response.assertStatus(200);
  return { harness, hash: await response.text() };
}

describe("readVisitorMeta", () => {
  test("hashes the address rather than carrying it", async () => {
    const hash = await ipHashFor(
      contextFor(await createTestDb(), { clientAddress: "203.0.113.7" }),
    );

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hashes one address the same way for the life of an install", async () => {
    const db = await createTestDb();

    expect(
      await ipHashFor(contextFor(db, { clientAddress: "203.0.113.7" })),
    ).toBe(await ipHashFor(contextFor(db, { clientAddress: "203.0.113.7" })));
  });

  test("hashes one address differently on another install", async () => {
    expect(
      await ipHashFor(
        contextFor(await createTestDb(), { clientAddress: "203.0.113.7" }),
      ),
    ).not.toBe(
      await ipHashFor(
        contextFor(await createTestDb(), { clientAddress: "203.0.113.7" }),
      ),
    );
  });

  test("ignores a forwarding header the visitor set on the request", async () => {
    const db = await createTestDb();
    const forged = contextFor(db, {
      request: requestWith({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9",
      }),
    });

    expect(await ipHashFor(forged)).toBe(await ipHashFor(contextFor(db)));
    expect(await ipHashFor(forged)).not.toBe(
      await ipHashFor(contextFor(db, { clientAddress: "203.0.113.7" })),
    );
  });

  test("shares one bucket across visitors with no resolvable address", async () => {
    const db = await createTestDb();

    const unknown = await ipHashFor(contextFor(db));

    expect(await ipHashFor(contextFor(db))).toBe(unknown);
    expect(
      await ipHashFor(contextFor(db, { clientAddress: "203.0.113.7" })),
    ).not.toBe(unknown);
  });

  test("hashes the address the runtime reported for the request", async () => {
    const { harness, hash } = await hashThroughHarness("203.0.113.7");

    // Same install, so the same salt: only the address can move the hash.
    expect(hash).toBe(
      await ipHashFor(contextFor(harness.db, { clientAddress: "203.0.113.7" })),
    );
    expect(hash).not.toBe(await ipHashFor(contextFor(harness.db)));
  });

  test("falls into the shared unknown bucket when the runtime reported none", async () => {
    const { harness, hash } = await hashThroughHarness();

    // Spelled out rather than compared to another address-less context: the
    // bucket's name is part of the stored-hash contract, and renaming it
    // re-buckets every existing install's no-address visitors.
    expect(hash).toBe(
      await ipHashFor(contextFor(harness.db, { clientAddress: "unknown" })),
    );
  });

  test("buckets two visitors of one install apart, by the address each request carried", async () => {
    const harness = await createDispatcherHarness({
      plugins: [echoVisitorHash],
      clientAddress: "203.0.113.7",
    });

    const first = await harness.fetch(HASH_ROUTE);
    const second = await harness.fetch(HASH_ROUTE, {
      clientAddress: "198.51.100.9",
    });

    // One install, so one salt: the addresses are the only thing that differ.
    expect(await second.text()).not.toBe(await first.text());
  });

  test("a request that names no address falls back to the harness's own", async () => {
    const harness = await createDispatcherHarness({
      plugins: [echoVisitorHash],
      clientAddress: "203.0.113.7",
    });

    const withDefault = await harness.fetch(HASH_ROUTE);

    expect(await withDefault.text()).toBe(
      await ipHashFor(contextFor(harness.db, { clientAddress: "203.0.113.7" })),
    );
  });

  test("truncates a hostile user-agent and reports an absent one as null", async () => {
    const db = await createTestDb();
    const options = { namespace: NAMESPACE };

    const long = await readVisitorMeta(
      contextFor(db, {
        clientAddress: "203.0.113.7",
        request: requestWith({ "user-agent": "u".repeat(4000) }),
      }),
      options,
    );
    const absent = await readVisitorMeta(
      contextFor(db, { clientAddress: "203.0.113.7" }),
      options,
    );

    expect(long.userAgent).toHaveLength(1024);
    expect(absent.userAgent).toBeNull();
  });

  test("refuses the old three-argument call rather than pooling its salt", async () => {
    const db = await createTestDb();
    // Exactly what a plugin compiled against readVisitorMeta(ctx, request,
    // options) passes: its request lands where the options now go.
    const stalePluginCall = readVisitorMeta(
      contextFor(db),
      requestWith() as unknown as VisitorMetaOptions,
    );

    await expect(stalePluginCall).rejects.toThrow(/needs a namespace/);
    const rows = await db
      .select({ group: settings.group })
      .from(settings)
      .where(eq(settings.key, "ip_salt"));
    expect(rows).toHaveLength(0);
  });

  test("mints one salt per namespace, in that namespace's private group", async () => {
    const db = await createTestDb();
    const ctx = contextFor(db, { clientAddress: "203.0.113.7" });

    await ipHashFor(ctx);
    const other = await readVisitorMeta(ctx, { namespace: "other" });

    const rows = await db
      .select({ group: settings.group, value: settings.value })
      .from(settings)
      .where(eq(settings.key, "ip_salt"));

    expect(rows.map((r) => r.group).sort()).toEqual([
      "other_internal",
      "spam_guard_internal",
    ]);
    for (const row of rows) expect(row.value).toMatch(/^[0-9a-f]{32}$/);
    expect(other.ipHash).not.toBe(await ipHashFor(ctx));
  });

  test("reads the salt once per request, not once per submission", async () => {
    const traced = await createTracedContext({ clientAddress: "203.0.113.7" });

    await traced.run(async () => {
      await ipHashFor(traced.ctx);
      const afterFirst = traced.dbQueryCount();

      await ipHashFor(traced.ctx);

      expect(traced.dbQueryCount()).toBe(afterFirst);
    });
  });
});
