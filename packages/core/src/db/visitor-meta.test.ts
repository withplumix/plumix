import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { createTracedContext } from "../test/traced-context.js";
import { eq } from "./index.js";
import { settings } from "./schema/settings.js";
import { readVisitorMeta } from "./visitor-meta.js";

const NAMESPACE = "spam_guard";

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://cms.example/submit", { method: "POST", headers });
}

async function ipHashFor(
  ctx: AppContext,
  headers: Record<string, string>,
): Promise<string> {
  const meta = await readVisitorMeta(ctx, requestWith(headers), {
    namespace: NAMESPACE,
  });
  return meta.ipHash;
}

async function freshContext(): Promise<AppContext> {
  return createTestContext({ db: await createTestDb() });
}

describe("readVisitorMeta", () => {
  test("hashes the address rather than carrying it", async () => {
    const hash = await ipHashFor(await freshContext(), {
      "cf-connecting-ip": "203.0.113.7",
    });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hashes one address the same way for the life of an install", async () => {
    const db = await createTestDb();
    const headers = { "cf-connecting-ip": "203.0.113.7" };

    expect(await ipHashFor(createTestContext({ db }), headers)).toBe(
      await ipHashFor(createTestContext({ db }), headers),
    );
  });

  test("hashes one address differently on another install", async () => {
    const headers = { "cf-connecting-ip": "203.0.113.7" };

    expect(await ipHashFor(await freshContext(), headers)).not.toBe(
      await ipHashFor(await freshContext(), headers),
    );
  });

  test("prefers cf-connecting-ip over the spoofable x-forwarded-for", async () => {
    const ctx = await freshContext();

    expect(
      await ipHashFor(ctx, {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9",
      }),
    ).toBe(await ipHashFor(ctx, { "cf-connecting-ip": "203.0.113.7" }));
  });

  test("takes the first hop of a chained x-forwarded-for", async () => {
    const ctx = await freshContext();

    expect(
      await ipHashFor(ctx, {
        "x-forwarded-for": "203.0.113.7, 198.51.100.9, 70.41.3.18",
      }),
    ).toBe(await ipHashFor(ctx, { "x-forwarded-for": "203.0.113.7" }));
  });

  test("shares one bucket across visitors with no resolvable address", async () => {
    const ctx = await freshContext();

    const unknown = await ipHashFor(ctx, {});

    expect(await ipHashFor(ctx, {})).toBe(unknown);
    expect(
      await ipHashFor(ctx, { "cf-connecting-ip": "203.0.113.7" }),
    ).not.toBe(unknown);
  });

  test("truncates a hostile user-agent and reports an absent one as null", async () => {
    const ctx = await freshContext();

    const long = await readVisitorMeta(
      ctx,
      requestWith({ "user-agent": "u".repeat(4000) }),
      { namespace: NAMESPACE },
    );
    const absent = await readVisitorMeta(ctx, requestWith({}), {
      namespace: NAMESPACE,
    });

    expect(long.userAgent).toHaveLength(1024);
    expect(absent.userAgent).toBeNull();
  });

  test("mints one salt per namespace, in that namespace's private group", async () => {
    const db = await createTestDb();
    const ctx = createTestContext({ db });
    const headers = { "cf-connecting-ip": "203.0.113.7" };

    await ipHashFor(ctx, headers);
    const other = await readVisitorMeta(ctx, requestWith(headers), {
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
    expect(other.ipHash).not.toBe(await ipHashFor(ctx, headers));
  });

  test("reads the salt once per request, not once per submission", async () => {
    const traced = await createTracedContext();

    await traced.run(async () => {
      await ipHashFor(traced.ctx, { "cf-connecting-ip": "203.0.113.7" });
      const afterFirst = traced.dbQueryCount();

      await ipHashFor(traced.ctx, { "cf-connecting-ip": "198.51.100.9" });

      expect(traced.dbQueryCount()).toBe(afterFirst);
    });
  });
});
