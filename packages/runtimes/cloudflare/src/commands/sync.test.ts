import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DumpReader,
  DumpWriter,
  OpenSyncEndOptions,
  PlumixApp,
  PlumixConfig,
  RuntimeSync,
  SyncEnd,
  SyncObject,
  SyncRow,
  SyncScope,
  SyncValue,
  TargetOptionValues,
} from "plumix";
import type { AppContext, HookRegistry } from "plumix/plugin";
import type {
  SyncContractEnds,
  SyncContractSite,
} from "plumix/test/conformance";
import type { GetPlatformProxyOptions, PlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness } from "plumix/test";
import { describeSyncContract } from "plumix/test/conformance";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { d1 } from "../d1.js";
import { r2 } from "../r2.js";
import { migrationsDeps } from "./migrations.js";
import { sync, syncDeps } from "./sync.js";

const CORE_MIGRATIONS = fileURLToPath(
  new URL("../../../../core/migrations", import.meta.url),
);

const WRANGLER_CONFIG = {
  name: "site",
  compatibility_date: "2026-04-01",
  d1_databases: [
    {
      binding: "DB",
      database_name: "site",
      database_id: "11111111-1111-1111-1111-111111111111",
    },
  ],
  r2_buckets: [{ binding: "MEDIA", bucket_name: "site-media" }],
};

let app: PlumixApp;
const opened: { dir: string; proxy: PlatformProxy }[] = [];

beforeAll(async () => {
  ({ app } = await createDispatcherHarness());
  // wrangler loads on first use, and a cold load alone can outlast a test.
  await import("wrangler");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const { dir, proxy } of opened.splice(0)) {
    await proxy.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});

interface State {
  readonly dir: string;
  readonly proxy: PlatformProxy;
}

/** A project directory with its own local D1 and R2, migrated. */
async function localState(
  wranglerConfig: object = WRANGLER_CONFIG,
): Promise<State> {
  const dir = mkdtempSync(join(tmpdir(), "plumix-cf-sync-"));
  const configPath = join(dir, "wrangler.json");
  writeFileSync(configPath, JSON.stringify(wranglerConfig));
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy({
    configPath,
    persist: { path: join(dir, ".wrangler/state/v3") },
  });
  opened.push({ dir, proxy });
  await migrate(drizzle(proxy.env.DB as D1Database), {
    migrationsFolder: CORE_MIGRATIONS,
    migrationsTable: "__drizzle_migrations_core",
  });
  return { dir, proxy };
}

/** The proxy wrangler hands back is a BLOB's bytes as an array. */
function siteValue(value: unknown): SyncValue {
  return Array.isArray(value)
    ? new Uint8Array(value as number[])
    : (value as SyncValue);
}

function contractSite(proxy: PlatformProxy): SyncContractSite {
  const db = proxy.env.DB as D1Database;
  return {
    async execute(sql, args = []) {
      const { results } = await db
        .prepare(sql)
        .bind(...args)
        .all();
      return results.map((row): SyncRow =>
        Object.fromEntries(
          Object.entries(row).map(([column, value]) => [
            column,
            siteValue(value),
          ]),
        ),
      );
    },
    storage: r2({ binding: "MEDIA" }).connect(proxy.env),
  };
}

/** Runs the contract's `sync:after` listeners as a plugin of the site. */
function siteConfig(hooks: HookRegistry): PlumixConfig {
  const conformance = definePlugin("conformance", (ctx) => {
    for (const { fn } of hooks.getActionHandlers("sync:after")) {
      ctx.addAction("sync:after", fn);
    }
  });
  return {
    ...app.config,
    database: d1({ binding: "DB" }),
    storage: r2({ binding: "MEDIA" }),
    plugins: [conformance],
  };
}

interface ProxyCall {
  readonly options: GetPlatformProxyOptions;
  readonly config: { readonly d1_databases: readonly object[] };
}

/**
 * Hands each open the proxy its project already holds, so the transport and
 * the test read one workerd's state; a remote open gets `deployed`'s.
 */
function reuseProxies(states: readonly State[], deployed?: State): ProxyCall[] {
  const calls: ProxyCall[] = [];
  vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
    (options: GetPlatformProxyOptions) => {
      calls.push({
        options,
        config: JSON.parse(
          readFileSync(options.configPath ?? "", "utf8"),
        ) as ProxyCall["config"],
      });
      const persist = options.persist;
      const state = options.remoteBindings
        ? deployed
        : states.find(
            ({ dir }) =>
              typeof persist === "object" &&
              persist.path === join(dir, ".wrangler/state/v3"),
          );
      if (state === undefined) throw new Error("no state for this open");
      return Promise.resolve({
        ...state.proxy,
        dispose: () => Promise.resolve(),
      });
    },
  );
  return calls;
}

async function twoLocalStates(hooks: HookRegistry): Promise<SyncContractEnds> {
  const local = await localState();
  const remote = await localState();
  reuseProxies([local, remote]);
  vi.spyOn(syncDeps, "report").mockImplementation(() => undefined);
  const config = siteConfig(hooks);
  const between: RuntimeSync = {
    open: (options) =>
      sync.open({
        ...options,
        config,
        target: "local",
        cwd: options.target === "local" ? local.dir : remote.dir,
      }),
  };
  return {
    sync: between,
    local: contractSite(local.proxy),
    remote: contractSite(remote.proxy),
  };
}

// Each case starts two miniflare instances; the contract's cases register in
// a nested describe, so the timeout is the suite's.
describe(
  "cloudflare sync between two local states",
  { timeout: 60_000 },
  () => {
    describeSyncContract({ open: twoLocalStates });
  },
);

const CONTENT: SyncScope = {
  name: "content",
  tables: [
    { table: "terms" },
    { table: "entries" },
    { table: "entry_term" },
    { table: "settings" },
  ],
};

const PRODUCTION_D1 = {
  binding: "DB",
  database_name: "site-prod",
  database_id: "prod-id",
};

function wranglerWith(config: object): object {
  return {
    name: "site",
    compatibility_date: "2026-04-01",
    r2_buckets: [{ binding: "MEDIA", bucket_name: "site-media" }],
    ...config,
  };
}

/**
 * wrangler's `d1 export` and `d1 execute` against the deployed stand-in:
 * the export is D1's own dump of the table, the execute runs the file.
 */
function standInWrangler(deployed: State): string[][] {
  const calls: string[][] = [];
  const db = deployed.proxy.env.DB as D1Database;
  const arg = (args: readonly string[], flag: string): string =>
    args[args.indexOf(flag) + 1] ?? "";
  vi.spyOn(syncDeps, "wrangler").mockImplementation(async (_cwd, args) => {
    calls.push([...args]);
    if (args[1] === "export") {
      const [lines] = await db
        .prepare("PRAGMA miniflare_d1_export(?,?,?);")
        .bind(1, 0, arg(args, "--table"))
        .raw<string[]>();
      writeFileSync(arg(args, "--output"), (lines ?? []).join("\n"));
    }
    if (args[1] === "execute") {
      await db.exec(readFileSync(arg(args, "--file"), "utf8"));
    }
  });
  return calls;
}

function captureReport(): string[] {
  const lines: string[] = [];
  vi.spyOn(syncDeps, "report").mockImplementation((line) => {
    lines.push(line);
  });
  return lines;
}

function openOptions(
  dir: string,
  target: "local" | "remote",
  targetValues: TargetOptionValues,
): OpenSyncEndOptions {
  return {
    cwd: dir,
    config: { ...app.config, database: d1({ binding: "DB" }) },
    target,
    binding: undefined,
    url: "https://example.com",
    owners: [
      {
        name: "core",
        migrationsFolder: CORE_MIGRATIONS,
        migrationsTable: "__drizzle_migrations_core",
      },
    ],
    targetValues,
  };
}

/** Collects what an end exports, and reads it back as a dump. */
async function exportedDump(
  end: SyncEnd,
  scopes: readonly SyncScope[],
): Promise<DumpReader> {
  const tables = new Map<string, SyncRow[]>();
  const authors: SyncRow[] = [];
  const collect = async (rows: AsyncIterable<SyncRow>): Promise<SyncRow[]> => {
    const collected: SyncRow[] = [];
    for await (const row of rows) collected.push(row);
    return collected;
  };
  const writer: DumpWriter = {
    async table(name, rows) {
      tables.set(name, await collect(rows));
    },
    async authors(rows) {
      authors.push(...(await collect(rows)));
    },
    async object(_key, body) {
      await body.cancel();
    },
  };
  const heads = await end.heads();
  await end.exportData(scopes, writer);
  async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
    for (const item of items) {
      await Promise.resolve();
      yield item;
    }
  }
  return {
    manifest: {
      format: 1,
      source: { origin: end.origin, basePath: "" },
      scopes: scopes.map((scope) => scope.name),
      tables: [...tables].map(([name, rows]) => ({ name, rows: rows.length })),
      authors: authors.length,
      objects: 0,
      heads,
    },
    rows: (table) => iterate(tables.get(table) ?? []),
    authors: () => iterate(authors),
    objects: () => iterate<SyncObject>([]),
  };
}

async function seedPost(state: State, slug: string): Promise<void> {
  const db = state.proxy.env.DB as D1Database;
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'ann@example.test', 'ann', 'admin')",
    ),
    db
      .prepare(
        "INSERT INTO entries (id, type, title, slug, author_id, status) VALUES (1, 'post', ?, ?, 1, 'published')",
      )
      .bind(slug, slug),
  ]);
}

async function entrySlugs(state: State): Promise<string[]> {
  const { results } = await (state.proxy.env.DB as D1Database)
    .prepare("SELECT slug FROM entries ORDER BY id")
    .all<{ slug: string }>();
  return results.map((row) => row.slug);
}

/** A project whose deployed database is `deployed`, with both ends open. */
async function deployedEnds(): Promise<{
  readonly project: State;
  readonly deployed: State;
  readonly calls: string[][];
}> {
  const project = await localState(
    wranglerWith({ d1_databases: [PRODUCTION_D1] }),
  );
  const deployed = await localState();
  reuseProxies([project], deployed);
  const calls = standInWrangler(deployed);
  vi.spyOn(migrationsDeps, "timeTravelBookmark").mockImplementation(
    (_cwd, database) => {
      calls.push(["time-travel", database]);
      return Promise.resolve("00000085-0000024c");
    },
  );
  return { project, deployed, calls };
}

async function run(state: State, script: string): Promise<void> {
  await (state.proxy.env.DB as D1Database).exec(script);
}

/** The local states a sync moves between, both open in the same project shape. */
async function twoProjects(): Promise<{ source: State; target: State }> {
  captureReport();
  const source = await localState();
  const target = await localState();
  reuseProxies([source, target]);
  return { source, target };
}

/** Exports `scopes` from `source` and imports them into `target`. */
async function replace(
  source: State,
  target: State,
  scopes: readonly SyncScope[],
): Promise<Awaited<ReturnType<SyncEnd["importData"]>>> {
  const from = await sync.open(openOptions(source.dir, "local", {}));
  const dump = await exportedDump(from, scopes);
  await from.close();
  const to = await sync.open(openOptions(target.dir, "local", {}));
  try {
    return await to.importData(dump, scopes, { dryRun: false });
  } finally {
    await to.close();
  }
}

const ANN =
  "INSERT INTO users (id, email, slug, role) VALUES (1, 'ann@example.test', 'ann', 'admin');";

function post(
  id: number,
  slug: string,
  author = 1,
  status = "published",
): string {
  return `INSERT INTO entries (id, type, title, slug, author_id, status) VALUES (${String(id)}, 'post', '${slug}', '${slug}', ${String(author)}, '${status}');`;
}

// Each case starts two miniflare instances.
describe(
  "cloudflare sync — a local import larger than one exec",
  { timeout: 30_000 },
  () => {
    test("runs the script in several exec calls, none over the cap, and lands every row", async () => {
      const { source, target } = await twoProjects();
      vi.spyOn(syncDeps, "localExecBytes").mockReturnValue(2_000);
      const posts = Array.from({ length: 40 }, (_, i) =>
        post(i + 1, `post-${String(i + 1)}`),
      );
      await run(source, [ANN, ...posts].join("\n"));
      await run(target, ANN);
      const db = target.proxy.env.DB as D1Database;
      const executed: number[] = [];
      const recording = {
        prepare: (sql: string) => db.prepare(sql),
        exec: (script: string) => {
          executed.push(new TextEncoder().encode(script).length);
          return db.exec(script);
        },
      };
      const reused = vi.mocked(migrationsDeps.getPlatformProxy);
      const open = reused.getMockImplementation();
      reused.mockImplementation(async (options) => {
        if (open === undefined) throw new Error("no proxy to reuse");
        const proxy = await open(options);
        const persist = options.persist;
        const intoTarget =
          typeof persist === "object" &&
          persist.path === join(target.dir, ".wrangler/state/v3");
        if (!intoTarget) return proxy;
        return { ...proxy, env: { ...proxy.env, DB: recording } };
      });

      await replace(source, target, [CONTENT]);

      expect(executed.length).toBeGreaterThan(1);
      expect(executed.every((bytes) => bytes <= 2_000)).toBe(true);
      expect((await entrySlugs(target)).length).toBe(40);
    });
  },
);

// Each case starts two miniflare instances.
describe(
  "cloudflare sync — a self-referencing table across exec calls",
  { timeout: 30_000 },
  () => {
    test("a row whose parent comes later in the dump lands after that parent, whatever call it falls in", async () => {
      const { source, target } = await twoProjects();
      vi.spyOn(syncDeps, "localExecBytes").mockReturnValue(2_000);
      const posts = Array.from({ length: 40 }, (_, i) =>
        post(i + 1, `post-${String(i + 1)}`),
      );
      await run(
        source,
        [ANN, ...posts, "UPDATE entries SET parent_id = 40 WHERE id = 1;"].join(
          "\n",
        ),
      );
      await run(target, ANN);

      await replace(source, target, [CONTENT]);

      expect(
        await contractSite(target.proxy).execute(
          "SELECT count(*) AS n, (SELECT parent_id FROM entries WHERE id = 1) AS parent FROM entries",
        ),
      ).toEqual([{ n: 40, parent: 40 }]);
    });
  },
);

describe(
  "cloudflare sync — settling the local site",
  { timeout: 30_000 },
  () => {
    // A site whose one `sync:after` listener is `listener`, on `binding`.
    function settlingConfig(
      listener: (ctx: AppContext) => Promise<void>,
      binding = "DB",
    ): PlumixConfig {
      const probe = definePlugin("probe", (ctx) => {
        ctx.addAction("sync:after", (_event, appCtx) => listener(appCtx));
      });
      return {
        ...app.config,
        database: d1({ binding }),
        plugins: [probe],
      };
    }

    test("runs inside the site on the platform proxy's env alone, reaching the local D1", async () => {
      const { source } = await twoProjects();
      await run(source, [ANN, post(1, "hello")].join("\n"));
      vi.stubEnv("PLUMIX_SYNC_PROBE", "from the shell");
      const seen: unknown[] = [];
      const config = settlingConfig(async (ctx) => {
        const rows = await ctx.db.select().from(entries);
        seen.push(rows.length, "PLUMIX_SYNC_PROBE" in ctx.env);
      });
      const end = await sync.open({
        ...openOptions(source.dir, "local", {}),
        config,
      });

      const settled = await end.settle({
        scopes: ["content"],
        direction: "pull",
      });
      await end.close();

      expect([settled.failures, seen]).toEqual([[], [1, false]]);
    });

    test("stops with sync_site_unreachable when the site cannot reach its D1", async () => {
      const { source } = await twoProjects();
      const end = await sync.open({
        ...openOptions(source.dir, "local", {}),
        binding: "DB",
        config: settlingConfig(() => Promise.resolve(), "MISSING"),
      });

      const settling = end.settle({ scopes: ["content"], direction: "pull" });

      await expect(settling).rejects.toMatchObject({
        code: "sync_site_unreachable",
      });
      await end.close();
    });
  },
);

describe("cloudflare sync — the import's report", { timeout: 30_000 }, () => {
  test("counts rows replaced, added and removed by primary key, and by the whole row in a table without one", async () => {
    const { source, target } = await twoProjects();
    const TAGS = "CREATE TABLE plugin_tags (entry_id integer, tag text);";
    await run(
      source,
      [
        TAGS,
        ANN,
        post(1, "kept"),
        post(2, "new"),
        "INSERT INTO plugin_tags VALUES (1, 'a'), (2, 'c');",
      ].join("\n"),
    );
    await run(
      target,
      [
        TAGS,
        ANN,
        post(1, "kept"),
        post(9, "gone"),
        "INSERT INTO plugin_tags VALUES (1, 'a'), (1, 'b');",
      ].join("\n"),
    );
    const tags: SyncScope = {
      name: "plugin:tags",
      tables: [{ table: "plugin_tags" }],
    };

    const report = await replace(source, target, [CONTENT, tags]);

    expect(report.tables).toEqual([
      { table: "terms", replaced: 0, added: 0, removed: 0 },
      { table: "entries", replaced: 1, added: 1, removed: 1 },
      { table: "entry_term", replaced: 0, added: 0, removed: 0 },
      { table: "settings", replaced: 0, added: 0, removed: 0 },
      { table: "plugin_tags", replaced: 1, added: 1, removed: 1 },
    ]);
  });

  test("a row outside the sync whose key would refuse the replace is removed, and one whose key clears is kept cleared, both counted", async () => {
    const { source, target } = await twoProjects();
    const PINS =
      "CREATE TABLE plugin_pins (id integer PRIMARY KEY, entry_id integer REFERENCES entries (id));";
    const MARKS =
      "CREATE TABLE plugin_marks (id integer PRIMARY KEY, entry_id integer REFERENCES entries (id) ON DELETE SET NULL);";
    await run(source, [PINS, MARKS, ANN, post(1, "hello")].join("\n"));
    await run(
      target,
      [
        PINS,
        MARKS,
        ANN,
        post(1, "hello"),
        "INSERT INTO plugin_pins VALUES (1, 1);",
        "INSERT INTO plugin_marks VALUES (1, 1);",
      ].join("\n"),
    );

    const report = await replace(source, target, [CONTENT]);

    expect(report.dependents).toEqual([
      { table: "plugin_marks", removed: 0, cleared: 1 },
      { table: "plugin_pins", removed: 1, cleared: 0 },
    ]);
    expect(
      await contractSite(target.proxy).execute(
        "SELECT (SELECT count(*) FROM plugin_pins) AS pins, (SELECT entry_id FROM plugin_marks) AS mark",
      ),
    ).toEqual([{ pins: 0, mark: null }]);
  });

  test("added authors get free numbered slugs, disabled at the import's time in seconds", async () => {
    const { source, target } = await twoProjects();
    vi.spyOn(syncDeps, "now").mockReturnValue(
      new Date("2026-10-18T00:00:00.000Z"),
    );
    await run(
      source,
      [
        "INSERT INTO users (id, email, slug, role) VALUES (1, 'a@example.test', 'bob', 'author'), (2, 'b@example.test', 'bob-2', 'author');",
        post(1, "first", 1),
        post(2, "second", 2),
      ].join("\n"),
    );
    await run(
      target,
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'other@example.test', 'bob', 'admin');",
    );

    await replace(source, target, [CONTENT]);

    expect(
      await contractSite(target.proxy).execute(
        "SELECT email, slug, disabled_at FROM users WHERE id > 1 ORDER BY email",
      ),
    ).toEqual([
      { email: "a@example.test", slug: "bob-2", disabled_at: 1792281600 },
      { email: "b@example.test", slug: "bob-2-2", disabled_at: 1792281600 },
    ]);
  });

  test("a users replace adds no author and counts no session it re-points", async () => {
    const { source, target } = await twoProjects();
    await run(source, [ANN, post(1, "hello")].join("\n"));
    await run(
      target,
      [
        "INSERT INTO users (id, email, slug, role) VALUES (5, 'ann@example.test', 'ann', 'admin');",
        "INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-ann', 5, 4102444800);",
      ].join("\n"),
    );
    const users: SyncScope = {
      name: "users",
      tables: [{ table: "users" }, { table: "credentials" }],
    };

    const report = await replace(source, target, [users, CONTENT]);

    expect([report.authorsAdded, report.dependents]).toEqual([[], []]);
  });

  test("a user column holding null travels as null", async () => {
    const { source, target } = await twoProjects();
    const REVIEWS =
      "CREATE TABLE plugin_reviews (id integer PRIMARY KEY, reviewer_id integer REFERENCES users (id));";
    await run(
      source,
      [REVIEWS, "INSERT INTO plugin_reviews VALUES (1, NULL);"].join("\n"),
    );
    await run(target, REVIEWS);
    const reviews: SyncScope = {
      name: "plugin:reviews",
      tables: [{ table: "plugin_reviews" }],
    };

    await replace(source, target, [reviews]);

    expect(
      await contractSite(target.proxy).execute("SELECT * FROM plugin_reviews"),
    ).toEqual([{ id: 1, reviewer_id: null }]);
  });

  test("an export of a table a `where` narrows holds only its rows, and only their authors", async () => {
    const { source } = await twoProjects();
    await run(
      source,
      [
        ANN,
        "INSERT INTO users (id, email, slug, role) VALUES (2, 'bob@example.test', 'bob', 'author');",
        post(1, "live", 1),
        post(2, "wip", 2, "draft"),
      ].join("\n"),
    );
    const end = await sync.open(openOptions(source.dir, "local", {}));
    const published: SyncScope = {
      name: "published",
      tables: [{ table: "entries", where: "status = 'published'" }],
    };

    const dump = await exportedDump(end, [published]);
    await end.close();

    const entries: SyncRow[] = [];
    for await (const row of dump.rows("entries")) entries.push(row);
    const authors: SyncRow[] = [];
    for await (const row of dump.authors()) authors.push(row);
    expect([entries.map((r) => r.slug), authors.map((r) => r.email)]).toEqual([
      ["live"],
      ["ann@example.test"],
    ]);
  });
});

// Each case starts two miniflare instances.
describe("cloudflare sync — a plugin's scope", { timeout: 30_000 }, () => {
  const NOTES =
    "CREATE TABLE plugin_notes (id integer PRIMARY KEY, entry_id integer NOT NULL REFERENCES entries (id) ON DELETE CASCADE, body text)";

  test("a plugin's table travels after content's, its rows and their references intact", async () => {
    captureReport();
    const local = await localState();
    const remote = await localState();
    reuseProxies([local, remote]);
    await (local.proxy.env.DB as D1Database).exec(NOTES);
    await (remote.proxy.env.DB as D1Database).exec(NOTES);
    await seedPost(local, "noted");
    await (local.proxy.env.DB as D1Database).exec(
      "INSERT INTO plugin_notes (id, entry_id, body) VALUES (7, 1, 'a note');",
    );
    const notes: SyncScope = {
      name: "plugin:notes",
      tables: [{ table: "plugin_notes" }],
    };
    const source = await sync.open(openOptions(local.dir, "local", {}));
    const dump = await exportedDump(source, [CONTENT, notes]);
    await source.close();
    const target = await sync.open(openOptions(remote.dir, "local", {}));

    await target.importData(dump, [CONTENT, notes], { dryRun: false });
    await target.close();

    expect(
      await contractSite(remote.proxy).execute(
        "SELECT n.id, n.body, e.slug FROM plugin_notes n JOIN entries e ON e.id = n.entry_id",
      ),
    ).toEqual([{ id: 7, body: "a note", slug: "noted" }]);
  });
});

// Each case starts two miniflare instances.
describe("cloudflare sync — the deployed end", { timeout: 30_000 }, () => {
  test("a pull exports each table through D1's export API, as `wrangler d1 export --remote` runs it", async () => {
    captureReport();
    const { project, deployed, calls } = await deployedEnds();
    await seedPost(deployed, "from-production");
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );

    const dump = await exportedDump(remote, [CONTENT]);
    await remote.close();

    expect(calls.map((args) => args.slice(0, 7))).toEqual(
      ["terms", "entries", "entry_term", "settings"].map((table) => [
        "d1",
        "export",
        "site-prod",
        "--remote",
        "--no-schema",
        "--table",
        table,
      ]),
    );
    const entries: SyncRow[] = [];
    for await (const row of dump.rows("entries")) entries.push(row);
    expect(entries.map((row) => row.slug)).toEqual(["from-production"]);
  });

  test("a dry run on the deployed end runs no wrangler command and writes nothing", async () => {
    captureReport();
    const { project, deployed, calls } = await deployedEnds();
    await seedPost(project, "from-local");
    await seedPost(deployed, "from-production");
    const local = await sync.open(openOptions(project.dir, "local", {}));
    const dump = await exportedDump(local, [CONTENT]);
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );

    await remote.importData(dump, [CONTENT], { dryRun: true });
    await remote.close();
    await local.close();

    expect(calls).toEqual([]);
    expect(await entrySlugs(deployed)).toEqual(["from-production"]);
  });

  test("a push's snapshot is a Time Travel bookmark taken before the import's one call to D1's import API", async () => {
    captureReport();
    const { project, deployed, calls } = await deployedEnds();
    await seedPost(project, "from-local");
    await seedPost(deployed, "from-production");
    const local = await sync.open(openOptions(project.dir, "local", {}));
    const dump = await exportedDump(local, [CONTENT]);
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );

    await remote.snapshot();
    await remote.importData(dump, [CONTENT], { dryRun: false });
    await remote.close();
    await local.close();

    expect(calls).toEqual([
      ["time-travel", "site-prod"],
      [
        "d1",
        "execute",
        "site-prod",
        "--remote",
        "--file",
        expect.stringMatching(/import\.sql$/) as unknown,
        "--yes",
      ],
    ]);
    expect(await entrySlugs(deployed)).toEqual(["from-local"]);
  });

  test("the restore hint prints the wrangler command that restores the bookmark", async () => {
    captureReport();
    const { project } = await deployedEnds();
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );

    const hint = remote.restoreHint(await remote.snapshot());
    await remote.close();

    expect(hint).toBe(
      "Snapshot: D1 Time Travel bookmark 00000085-0000024c. To restore site-prod as it was before this import, run `wrangler d1 time-travel restore site-prod --bookmark=00000085-0000024c`. Time Travel restores the database, not the media objects.",
    );
  });

  test("its settle runs inside the deployed site at --url", async () => {
    captureReport();
    const { project } = await deployedEnds();
    vi.stubEnv("PLUMIX_API_TOKEN", "pat_site");
    const fetched = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ cdn: "purged", failures: [] }));
    vi.stubGlobal("fetch", fetched);
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );

    const settled = await remote.settle({
      scopes: ["content"],
      direction: "push",
    });
    await remote.close();

    expect(settled).toEqual({ cdn: "purged", failures: [] });
    expect(fetched).toHaveBeenCalledWith(
      "https://example.com/_plumix/api/v1/system/sync/settle",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer pat_site",
        }) as unknown,
        body: JSON.stringify({ scopes: ["content"], direction: "push" }),
      }),
    );
  });
});

// Each case starts two miniflare instances.
describe(
  "cloudflare sync — the database a target names",
  { timeout: 30_000 },
  () => {
    // The database the remote end reached, and the lines it announced.
    async function reached(
      wranglerConfig: object,
      target: TargetOptionValues,
    ): Promise<{ database: object | undefined; lines: string[] }> {
      const lines = captureReport();
      const project = await localState(wranglerWith(wranglerConfig));
      const calls = reuseProxies([project], project);
      const remote = await sync.open(
        openOptions(project.dir, "remote", target),
      );
      await remote.close();
      return { database: calls[0]?.config.d1_databases[0], lines };
    }

    test("--production reaches the top level's database and announces it", async () => {
      expect(
        await reached({ d1_databases: [PRODUCTION_D1] }, { production: true }),
      ).toEqual({
        database: { ...PRODUCTION_D1, remote: true },
        lines: ["→ production (top level) · DB · site-prod"],
      });
    });

    test("--env qa reaches env.qa's database", async () => {
      const qa = {
        binding: "DB",
        database_name: "site-qa",
        database_id: "qa-id",
      };

      expect(
        await reached(
          {
            d1_databases: [PRODUCTION_D1],
            env: { qa: { d1_databases: [qa] } },
          },
          { env: "qa" },
        ),
      ).toEqual({
        database: { ...qa, remote: true },
        lines: ["→ qa (env.qa) · DB · site-qa"],
      });
    });

    test("--preview reaches the previews database, with the note that every Preview shares it", async () => {
      const preview = {
        binding: "DB",
        database_name: "site-preview",
        database_id: "preview-id",
      };

      expect(
        await reached(
          {
            d1_databases: [PRODUCTION_D1],
            previews: { d1_databases: [preview] },
          },
          { preview: true },
        ),
      ).toEqual({
        database: { ...preview, remote: true },
        lines: [
          "→ preview (top-level previews) · DB · site-preview",
          "  Every Worker Preview without a previews block of its own uses this database too.",
        ],
      });
    });

    test("a deployed end with no target option fails before connecting", async () => {
      captureReport();
      const project = await localState(
        wranglerWith({ d1_databases: [PRODUCTION_D1] }),
      );
      const calls = reuseProxies([project], project);

      await expect(
        sync.open(openOptions(project.dir, "remote", {})),
      ).rejects.toMatchObject({ code: "sync_remote_target_missing" });
      expect(calls).toEqual([]);
    });

    test("the local end is the database `plumix dev` uses, whatever the target options name", async () => {
      captureReport();
      const project = await localState(
        wranglerWith({ d1_databases: [PRODUCTION_D1] }),
      );
      const calls = reuseProxies([project]);

      const local = await sync.open(
        openOptions(project.dir, "local", { production: true }),
      );
      await local.close();

      expect(calls[0]?.options).toMatchObject({
        persist: { path: join(project.dir, ".wrangler/state/v3") },
        remoteBindings: false,
      });
    });
  },
);

/** D1's cap on one SQL statement, which its import API holds a file's to. */
const D1_STATEMENT_BYTES = 100_000;

const TERMS_PER_ENTRY = 14;

/**
 * eduscope.uk's 1.1M entry_term rows take minutes; `PLUMIX_SYNC_SCALE_ROWS`
 * runs the same test at that scale.
 */
const SCALE_ROWS = Number(process.env.PLUMIX_SYNC_SCALE_ROWS ?? 14_000);

/** `rows` entry_term rows over the entries and terms they link. */
async function seedCatalogue(state: State, rows: number): Promise<void> {
  const entries = Math.ceil(rows / TERMS_PER_ENTRY);
  const lines = [
    "INSERT INTO users (id, email, slug, role) VALUES (1, 'ann@example.test', 'ann', 'admin');",
  ];
  for (let term = 1; term <= TERMS_PER_ENTRY; term++) {
    lines.push(
      `INSERT INTO terms (id, taxonomy, name, slug) VALUES (${String(term)}, 'category', 't${String(term)}', 't${String(term)}');`,
    );
  }
  for (let entry = 1; entry <= entries; entry++) {
    lines.push(
      `INSERT INTO entries (id, type, title, slug, author_id, status) VALUES (${String(entry)}, 'post', 'e', 'e${String(entry)}', 1, 'published');`,
    );
  }
  for (let row = 0; row < rows; row++) {
    lines.push(
      `INSERT INTO entry_term (entry_id, term_id) VALUES (${String(Math.floor(row / TERMS_PER_ENTRY) + 1)}, ${String((row % TERMS_PER_ENTRY) + 1)});`,
    );
  }
  await (state.proxy.env.DB as D1Database).exec(lines.join("\n"));
}

async function entryTermRows(state: State): Promise<number> {
  const row = await (state.proxy.env.DB as D1Database)
    .prepare("SELECT count(*) AS n FROM entry_term")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** The statements of each script the deployed end executes. */
function measureScripts(): { statements: number; longest: number }[] {
  const scripts: { statements: number; longest: number }[] = [];
  const execute = vi.mocked(syncDeps.wrangler).getMockImplementation();
  vi.mocked(syncDeps.wrangler).mockImplementation(async (cwd, args) => {
    if (args[1] === "execute") {
      const lines = readFileSync(args[args.indexOf("--file") + 1] ?? "", "utf8")
        .split("\n")
        .filter((line) => line !== "");
      scripts.push({
        statements: lines.length,
        longest: lines.reduce(
          (longest, line) =>
            Math.max(longest, new TextEncoder().encode(line).length),
          0,
        ),
      });
    }
    await execute?.(cwd, args);
  });
  return scripts;
}

// The 1.1M-row run takes minutes; the default size runs in seconds.
describe("cloudflare sync — a catalogue at scale", { timeout: 900_000 }, () => {
  test(`${String(SCALE_ROWS)} entry_term rows push through one import call within D1's statement cap, and pull back`, async () => {
    captureReport();
    const { project, deployed } = await deployedEnds();
    const scripts = measureScripts();
    await seedCatalogue(project, SCALE_ROWS);

    const local = await sync.open(openOptions(project.dir, "local", {}));
    const remote = await sync.open(
      openOptions(project.dir, "remote", { production: true }),
    );
    await remote.importData(await exportedDump(local, [CONTENT]), [CONTENT], {
      dryRun: false,
    });
    await local.importData(await exportedDump(remote, [CONTENT]), [CONTENT], {
      dryRun: false,
    });
    await remote.close();
    await local.close();

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.longest).toBeLessThan(D1_STATEMENT_BYTES);
    expect([
      await entryTermRows(deployed),
      await entryTermRows(project),
    ]).toEqual([SCALE_ROWS, SCALE_ROWS]);
  });
});
