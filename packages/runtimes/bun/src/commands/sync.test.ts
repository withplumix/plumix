import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type * as BunSqlite from "bun:sqlite";
import type { HookRegistry, PlumixApp, PlumixConfig } from "plumix";
import type { SyncRow, SyncValue } from "plumix/cli";
import type {
  SyncContractEnds,
  SyncContractSite,
} from "plumix/test/conformance";
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

import { bunSqlite } from "../bun-sqlite.js";
import { diskStorage } from "../disk-storage.js";
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
const servers: { stop(closeActiveConnections?: boolean): Promise<void> }[] = [];

beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-sync-"));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  rmSync(dir, { recursive: true, force: true });
});

function siteConfig(name: string): PlumixConfig {
  return {
    ...base.config,
    database: bunSqlite({ path: join(dir, name, "site.sqlite") }),
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
      // Only Bun resolves `bun:sqlite`; this suite runs on Bun.
      const { Database } = process.getBuiltinModule(
        "bun:sqlite",
      ) as typeof BunSqlite;
      const database = new Database(path);
      try {
        return Promise.resolve(
          database
            .prepare(sql)
            .all(...(args as Exclude<SyncValue, null>[]))
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
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => handler.fetch(request, { env: {} }),
  });
  servers.push(server);
  const { port } = server;
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

function options(target: "local" | "remote", url: string, apiToken: string) {
  return {
    cwd: dir,
    config: siteConfig("local"),
    target,
    binding: undefined,
    url,
    apiToken: () => Promise.resolve(apiToken),
    owners: [{ name: "core", ...CORE }],
    targetValues: {},
  } as const;
}

describe("bun sync — the deployed site's snapshot", () => {
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
