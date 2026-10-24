import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { HookRegistry, PlumixApp, PlumixConfig } from "plumix";
import type {
  DumpReader,
  SyncEnd,
  SyncRow,
  SyncScope,
  SyncValue,
} from "plumix/cli";
import type {
  SyncContractEnds,
  SyncContractSite,
} from "plumix/test/conformance";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { definePlugin } from "plumix/plugin";
import { buildApp, createRuntimeHandler } from "plumix/runtime";
import { createDispatcherHarness, factoriesFor } from "plumix/test";
import { describeSyncContract } from "plumix/test/conformance";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { diskStorage } from "../disk-storage.js";
import { createRequestListener } from "../http/bridge.js";
import { nodeSqlite } from "../node-sqlite.js";
import { migrations } from "./migrations.js";
import { sync } from "./sync.js";

/** Core's shipped history, read from the workspace. */
const CORE = {
  migrationsFolder: fileURLToPath(
    new URL("../../../../core/migrations", import.meta.url),
  ),
  migrationsTable: "__drizzle_migrations_core",
};

let base: PlumixApp;
let dir: string;
const servers: Server[] = [];

beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-sync-"));
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) => new Promise((resolve) => server.close(() => resolve(null))),
      ),
  );
  rmSync(dir, { recursive: true, force: true });
});

function siteConfig(
  name: string,
  plugins: PlumixConfig["plugins"] = base.config.plugins,
): PlumixConfig {
  return {
    ...base.config,
    plugins,
    database: nodeSqlite({ path: join(dir, name, "site.sqlite") }),
    storage: diskStorage({ dir: join(dir, name, "media") }),
  };
}

async function migrated(config: PlumixConfig): Promise<void> {
  const db = await migrations.open({
    cwd: dir,
    config,
    location: "site",
    binding: undefined,
    targetValues: {},
  });
  try {
    await db.migrate(CORE);
  } finally {
    await db.close();
  }
}

function contractSite(
  name: string,
  path = join(dir, name, "site.sqlite"),
): SyncContractSite {
  return {
    execute(sql, args = []) {
      const database = new DatabaseSync(path);
      try {
        return Promise.resolve(
          database
            .prepare(sql)
            .all(...(args as SyncValue[]))
            .map((row) => row as SyncRow),
        );
      } finally {
        database.close();
      }
    },
    storage: diskStorage({ dir: join(dir, name, "media") }).connect({}),
  };
}

/** The remote site served on 127.0.0.1, with an operator's API token. */
async function serve(
  config: PlumixConfig,
  hooks: HookRegistry,
): Promise<{ url: string; apiToken: string }> {
  const app = await buildApp(config);
  for (const handler of hooks.getActionHandlers("sync:after")) {
    app.hooks.addAction("sync:after", handler.fn, { plugin: handler.plugin });
  }
  const handler = createRuntimeHandler(app);
  const server = createServer(
    createRequestListener((request) =>
      Promise.resolve(handler.fetch(request, { env: {} })),
    ),
  );
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const { db, close } = config.database.connect(
    {},
    new Request("http://127.0.0.1/"),
    {},
  );
  try {
    const factory = factoriesFor(db as Parameters<typeof factoriesFor>[0]);
    const operator = await factory.user.create({
      id: 1000,
      email: "operator@remote.test",
      role: "admin",
    });
    const { secret } = await factory.apiToken.create({ userId: operator.id });
    return { url: `http://127.0.0.1:${String(port)}`, apiToken: secret };
  } finally {
    close?.();
  }
}

async function nodeEnds(hooks: HookRegistry): Promise<SyncContractEnds> {
  const local = siteConfig("local");
  const remote = siteConfig("remote");
  await migrated(local);
  await migrated(remote);
  const { url, apiToken } = await serve(remote, hooks);
  return {
    // The case's options name no site; the local end is this one.
    sync: {
      open: (options) =>
        sync.open(
          options.target === "local"
            ? { ...options, cwd: dir, config: local }
            : options,
        ),
    },
    remoteUrl: url,
    apiToken,
    local: contractSite("local"),
    remote: contractSite("remote"),
  };
}

describeSyncContract({ open: nodeEnds });

function options(
  target: "local" | "remote",
  url: string,
  apiToken: string,
  config = siteConfig("local"),
) {
  return {
    cwd: dir,
    config,
    target,
    binding: undefined,
    url,
    apiToken: () => Promise.resolve(apiToken),
    owners: [{ name: "core", ...CORE }],
    targetValues: {},
  } as const;
}

describe("node sync — the deployed site's snapshot", () => {
  test("copies the database file beside it, and names the copy and the restore command", async () => {
    const remote = siteConfig("remote");
    await migrated(remote);
    const { url, apiToken } = await serve(remote, base.hooks);
    const end = await sync.open(options("remote", url, apiToken));

    const snapshot = await end.snapshot();

    const file = join(dir, "remote", "site.sqlite");
    expect(snapshot.id).toMatch(
      new RegExp(`^${file}\\.snapshot-\\d{8}T\\d{9}Z$`),
    );
    expect(end.restoreHint(snapshot)).toBe(
      `Saved a snapshot of the database at ${snapshot.id}. To restore it, stop the site, then run: cp '${snapshot.id}' '${file}' && rm -f '${file}-wal' '${file}-shm'`,
    );
  });

  test("two snapshots in one second are two copies", async () => {
    const remote = siteConfig("remote");
    await migrated(remote);
    const { url, apiToken } = await serve(remote, base.hooks);
    const end = await sync.open(options("remote", url, apiToken));

    const first = await end.snapshot();
    const second = await end.snapshot();

    expect(second.id).not.toBe(first.id);
  });

  test("an import cut short leaves the site as its snapshot holds it", async () => {
    const remote = siteConfig("remote");
    await migrated(remote);
    const { url, apiToken } = await serve(remote, base.hooks);
    const site = contractSite("remote");
    await site.execute(
      "INSERT INTO entries (id, type, title, slug, author_id, status) VALUES (1, 'post', 'Kept', 'kept', 1000, 'published')",
    );
    const end = await sync.open(options("remote", url, apiToken));
    const snapshot = await end.snapshot();
    const [head] = await site.execute(
      "SELECT created_at FROM __drizzle_migrations_core ORDER BY created_at DESC LIMIT 1",
    );
    const manifest = {
      format: 1,
      source: { origin: "http://localhost", basePath: "" },
      scopes: ["content"],
      tables: [],
      authors: 0,
      objects: 0,
      heads: { __drizzle_migrations_core: String(head?.created_at) },
    };
    // Every content table emptied, and the stream stops before its last line.
    const lines = [
      { header: { manifest, tables: {} } },
      { section: "authors" },
      ...["terms", "entries", "entry_term", "settings"].map((name) => ({
        section: "table",
        name,
      })),
    ];

    const response = await fetch(
      `${url}/_plumix/api/v1/system/sync/import?scopes=content&dryRun=false`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}` },
        body: lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
      },
    );

    expect(response.status).toBe(400);
    const slugs = "SELECT slug FROM entries ORDER BY id";
    expect(await site.execute(slugs)).toEqual([{ slug: "kept" }]);
    expect(await contractSite("remote", snapshot.id).execute(slugs)).toEqual([
      { slug: "kept" },
    ]);
  });
});

const notes = sqliteTable("notes", {
  id: integer().primaryKey(),
  body: text().notNull(),
  data: blob(),
  authorId: integer("author_id"),
});

const notesPlugin = definePlugin("notes", {
  setup: () => undefined,
  schema: { notes },
  schemaModule: "notes/schema",
});

const NOTES_SCOPE: SyncScope = {
  name: "plugin:notes",
  tables: [{ table: "notes" }],
};

const NOTES_TABLE =
  "CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL, data blob, author_id integer REFERENCES users (id))";

async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

/** Exports the scope from one end into memory and imports it into the other. */
async function transfer(
  from: SyncEnd,
  to: SyncEnd,
  scopes: readonly SyncScope[],
): Promise<void> {
  const tables = new Map<string, SyncRow[]>();
  const authors: SyncRow[] = [];
  async function collect(rows: AsyncIterable<SyncRow>, into: SyncRow[]) {
    for await (const row of rows) into.push(row);
  }
  await from.exportData(scopes, {
    async table(name, rows) {
      const into: SyncRow[] = [];
      tables.set(name, into);
      await collect(rows, into);
    },
    authors: (rows) => collect(rows, authors),
    object: (_key, body) => body.cancel(),
  });
  const dump: DumpReader = {
    manifest: {
      format: 1,
      source: { origin: from.origin, basePath: "" },
      scopes: scopes.map((scope) => scope.name),
      tables: [...tables].map(([name, rows]) => ({ name, rows: rows.length })),
      authors: authors.length,
      objects: 0,
      heads: await from.heads(),
    },
    rows: (table) => iterate(tables.get(table) ?? []),
    authors: () => iterate(authors),
    objects: () => iterate([]),
  };
  await to.importData(dump, scopes, { dryRun: false });
}

const NOTES =
  "SELECT n.id, n.body, n.data, u.email FROM notes n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.id";

describe("node sync — a plugin scope", () => {
  test("pushes to the deployed site and pulls back through its routes, a BLOB and an author included", async () => {
    const local = siteConfig("local", [...base.config.plugins, notesPlugin]);
    const remote = siteConfig("remote", [...base.config.plugins, notesPlugin]);
    await migrated(local);
    await migrated(remote);
    const localSite = contractSite("local");
    const remoteSite = contractSite("remote");
    await localSite.execute(NOTES_TABLE);
    await remoteSite.execute(NOTES_TABLE);
    await localSite.execute(
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'alice@example.test', 'alice', 'editor')",
    );
    await localSite.execute(
      "INSERT INTO notes (id, body, data, author_id) VALUES (7, 'from local', ?, 1)",
      [new Uint8Array([0, 1, 254, 255])],
    );
    const { url, apiToken } = await serve(remote, base.hooks);
    const localEnd = await sync.open(options("local", url, apiToken, local));
    const remoteEnd = await sync.open(options("remote", url, apiToken, local));

    await transfer(localEnd, remoteEnd, [NOTES_SCOPE]);
    const pushed = await remoteSite.execute(NOTES);
    await remoteSite.execute(
      "UPDATE notes SET body = 'edited remotely' WHERE id = 7",
    );
    await remoteSite.execute(
      "INSERT INTO notes (id, body, author_id) VALUES (8, 'remote only', 1000)",
    );
    await transfer(remoteEnd, localEnd, [NOTES_SCOPE]);
    await localEnd.close();

    expect(pushed).toEqual([
      {
        id: 7,
        body: "from local",
        data: new Uint8Array([0, 1, 254, 255]),
        email: "alice@example.test",
      },
    ]);
    expect(await localSite.execute(NOTES)).toEqual([
      {
        id: 7,
        body: "edited remotely",
        data: new Uint8Array([0, 1, 254, 255]),
        email: "alice@example.test",
      },
      { id: 8, body: "remote only", data: null, email: "operator@remote.test" },
    ]);
  });
});
