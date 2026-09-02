import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
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

/** One install, one visitor: the context a runtime that resolved an address builds. */
function contextFor(db: TestDb, clientAddress?: string): AppContext {
  return createTestContext({ db, clientAddress });
}

async function ipHashFor(ctx: AppContext): Promise<string> {
  const meta = await readVisitorMeta(ctx, requestWith(), {
    namespace: NAMESPACE,
  });
  return meta.ipHash;
}

/**
 * The one route a plugin would write over `readVisitorMeta`, so a test reads
 * back what the whole request path — adapter fact to hashed bucket — produced.
 */
const echoVisitorHash = definePlugin("visitor_echo", (ctx) => {
  ctx.registerPublicRoute({
    path: HASH_ROUTE,
    handler: async (request, appCtx) =>
      new Response(
        (await readVisitorMeta(appCtx, request, { namespace: NAMESPACE }))
          .ipHash,
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
      contextFor(await createTestDb(), "203.0.113.7"),
    );

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hashes one address the same way for the life of an install", async () => {
    const db = await createTestDb();

    expect(await ipHashFor(contextFor(db, "203.0.113.7"))).toBe(
      await ipHashFor(contextFor(db, "203.0.113.7")),
    );
  });

  test("hashes one address differently on another install", async () => {
    expect(
      await ipHashFor(contextFor(await createTestDb(), "203.0.113.7")),
    ).not.toBe(
      await ipHashFor(contextFor(await createTestDb(), "203.0.113.7")),
    );
  });

  test("ignores a forwarding header the visitor set on the request", async () => {
    const db = await createTestDb();
    const forged = await readVisitorMeta(
      contextFor(db),
      requestWith({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9",
      }),
      { namespace: NAMESPACE },
    );

    expect(forged.ipHash).toBe(await ipHashFor(contextFor(db)));
    expect(forged.ipHash).not.toBe(
      await ipHashFor(contextFor(db, "203.0.113.7")),
    );
  });

  test("shares one bucket across visitors with no resolvable address", async () => {
    const db = await createTestDb();

    const unknown = await ipHashFor(contextFor(db));

    expect(await ipHashFor(contextFor(db))).toBe(unknown);
    expect(await ipHashFor(contextFor(db, "203.0.113.7"))).not.toBe(unknown);
  });

  test("hashes the address the runtime reported for the request", async () => {
    const { harness, hash } = await hashThroughHarness("203.0.113.7");

    // Same install, so the same salt: only the address can move the hash.
    expect(hash).toBe(await ipHashFor(contextFor(harness.db, "203.0.113.7")));
    expect(hash).not.toBe(await ipHashFor(contextFor(harness.db)));
  });

  test("falls into the shared unknown bucket when the runtime reported none", async () => {
    const { harness, hash } = await hashThroughHarness();

    expect(hash).toBe(await ipHashFor(contextFor(harness.db, "unknown")));
  });

  test("truncates a hostile user-agent and reports an absent one as null", async () => {
    const ctx = contextFor(await createTestDb(), "203.0.113.7");

    const long = await readVisitorMeta(
      ctx,
      requestWith({ "user-agent": "u".repeat(4000) }),
      { namespace: NAMESPACE },
    );
    const absent = await readVisitorMeta(ctx, requestWith(), {
      namespace: NAMESPACE,
    });

    expect(long.userAgent).toHaveLength(1024);
    expect(absent.userAgent).toBeNull();
  });

  test("mints one salt per namespace, in that namespace's private group", async () => {
    const db = await createTestDb();
    const ctx = contextFor(db, "203.0.113.7");

    await ipHashFor(ctx);
    const other = await readVisitorMeta(ctx, requestWith(), {
      namespace: "other",
    });

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
