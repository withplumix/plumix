import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import * as schema from "../db/schema/index.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { applyCoreTestSchema } from "../test/harness.js";
import { libsqlSyncDatabase } from "../test/sync/memory-sync.js";

const SYNC_URL = "https://cms.example/_plumix/api/v1/system/sync";

const ENDPOINTS = [
  { method: "GET", path: "heads" },
  { method: "GET", path: "export?scopes=content" },
  { method: "POST", path: "import?scopes=content&dryRun=true" },
  { method: "POST", path: "snapshot" },
] as const;

function syncRequest(
  endpoint: (typeof ENDPOINTS)[number],
  secret: string | undefined,
): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request(`${SYNC_URL}/${endpoint.path}`, {
    method: endpoint.method,
    headers,
    ...(endpoint.method === "POST" && { body: "" }),
  });
}

async function tokenFor(
  h: DispatcherHarness,
  role: "admin" | "editor",
): Promise<string> {
  const user = await h.factory.user.create({ role });
  const { secret } = await h.factory.apiToken.create({ userId: user.id });
  return secret;
}

describe("the sync transfer endpoints", () => {
  for (const endpoint of ENDPOINTS) {
    test(`${endpoint.method} ${endpoint.path} answers 401 without a token`, async () => {
      const h = await createDispatcherHarness();

      const response = await h.dispatch(syncRequest(endpoint, undefined));

      expect(response.status).toBe(401);
    });

    test(`${endpoint.method} ${endpoint.path} answers 403 for a token whose user may not manage settings`, async () => {
      const h = await createDispatcherHarness();
      const secret = await tokenFor(h, "editor");

      const response = await h.dispatch(syncRequest(endpoint, secret));

      expect(response.status).toBe(403);
    });
  }
});

/** A site whose database opens for a sync, and an operator's token. */
async function syncSite(): Promise<{
  readonly h: DispatcherHarness;
  readonly secret: string;
}> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema, casing: "snake_case" });
  await applyCoreTestSchema(db);
  const h = await createDispatcherHarness({
    db,
    config: {
      database: {
        kind: "memory-sync",
        connect: () => ({ db }),
        openSync: () => libsqlSyncDatabase(client),
      },
    },
  });
  return { h, secret: await tokenFor(h, "admin") };
}

function importRequest(secret: string, lines: readonly unknown[]): Request {
  return new Request(`${SYNC_URL}/import?scopes=content&dryRun=false`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-ndjson",
    },
    body: lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
  });
}

function header(heads: Readonly<Record<string, string | null>>): unknown {
  return {
    header: {
      manifest: {
        format: 1,
        source: { origin: "https://local.example", basePath: "" },
        scopes: ["content"],
        tables: [],
        authors: 0,
        objects: 0,
        heads,
      },
      tables: {},
    },
  };
}

async function seedEntry(h: DispatcherHarness, slug: string): Promise<void> {
  const author = await h.factory.user.create({ role: "editor" });
  await h.factory.entry.create({ slug, authorId: author.id });
}

async function slugs(h: DispatcherHarness): Promise<string[]> {
  return (await h.db.query.entries.findMany()).map((entry) => entry.slug);
}

async function coreHead(h: DispatcherHarness): Promise<string> {
  const response = await h.dispatch(
    new Request(`${SYNC_URL}/heads`, {
      headers: { authorization: `Bearer ${await tokenFor(h, "admin")}` },
    }),
  );
  const { heads } = (await response.json()) as {
    heads: Record<string, string>;
  };
  return heads.__drizzle_migrations_core ?? "";
}

/** Every content table emptied, as a dump of an empty site would leave it. */
const EMPTY_CONTENT = [
  { section: "authors" },
  { section: "table", name: "terms" },
  { section: "table", name: "entries" },
  { section: "table", name: "entry_term" },
  { section: "table", name: "settings" },
];

describe("POST /_plumix/api/v1/system/sync/import", () => {
  test("refuses a dump at other heads with 409 before it writes", async () => {
    const { h, secret } = await syncSite();
    await seedEntry(h, "kept");

    const response = await h.dispatch(
      importRequest(secret, [
        header({ __drizzle_migrations_core: "1" }),
        ...EMPTY_CONTENT,
        { end: true },
      ]),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "sync_migrations_differ" },
    });
    expect(await slugs(h)).toEqual(["kept"]);
  });

  test("rolls back a dump whose stream ends before its last line", async () => {
    const { h, secret } = await syncSite();
    await seedEntry(h, "kept");
    const head = await coreHead(h);

    const response = await h.dispatch(
      importRequest(secret, [
        header({ __drizzle_migrations_core: head }),
        ...EMPTY_CONTENT,
      ]),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "sync_dump_incomplete" },
    });
    expect(await slugs(h)).toEqual(["kept"]);
  });

  test("replaces the scope with a whole dump's rows", async () => {
    const { h, secret } = await syncSite();
    await seedEntry(h, "replaced");
    const head = await coreHead(h);

    const response = await h.dispatch(
      importRequest(secret, [
        header({ __drizzle_migrations_core: head }),
        ...EMPTY_CONTENT,
        { end: true },
      ]),
    );

    expect(response.status).toBe(200);
    expect(await slugs(h)).toEqual([]);
  });
});

describe("a site whose database cannot open for a sync", () => {
  test("answers 501", async () => {
    const h = await createDispatcherHarness();
    const secret = await tokenFor(h, "admin");

    const response = await h.dispatch(
      syncRequest({ method: "GET", path: "heads" }, secret),
    );

    expect(response.status).toBe(501);
  });
});
