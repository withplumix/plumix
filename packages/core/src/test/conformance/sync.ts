import { expect } from "vitest";

import type {
  DumpReader,
  DumpWriter,
  OpenSyncEndOptions,
  RuntimeSync,
  SyncEnd,
  SyncImportReport,
  SyncScope,
  SyncTarget,
} from "../../context/runtime-adapter.js";
import type {
  ConnectedObjectStorage,
  SyncRow,
  SyncValue,
} from "../../runtime/contract/slots.js";
import type { ContractCase } from "./case.js";
import { CORE_MIGRATIONS_FOLDER } from "../../cli/migrations.js";
import { CORE_SYNC_SCOPE_TABLES, SYNC_AUTH_TABLES } from "../../cli/sync.js";
import { HookRegistry } from "../../hooks/registry.js";
import { sync } from "../../hooks/sync.js";
import { testConfig } from "../config.js";
import { memoryDump } from "../sync/memory-dump.js";
import { describeContract } from "./case.js";

const REMOTE_URL = "https://remote.conformance.test";

/** One end as the suite seeds it and reads it back. */
export interface SyncContractSite {
  /** Runs one statement on the end's database; a BLOB reads back as bytes. */
  execute(
    sql: string,
    args?: readonly SyncValue[],
  ): Promise<readonly SyncRow[]>;
  readonly storage: ConnectedObjectStorage;
}

export interface SyncContractEnds {
  readonly sync: RuntimeSync;
  /** The remote site's origin, which `url` names; a placeholder without it. */
  readonly remoteUrl?: string;
  /** What `apiToken` resolves to, for a remote end that calls its site. */
  readonly apiToken?: string;
  readonly local: SyncContractSite;
  readonly remote: SyncContractSite;
}

export interface SyncContractOptions {
  /**
   * Fresh ends for one case: core's migrations applied, no rows bar the
   * `apiToken` user's (id above 100), no objects. Each `settle` runs the
   * `sync.after` handlers on `hooks`.
   */
  readonly open: (hooks: HookRegistry) => Promise<SyncContractEnds>;
}

type Case = ContractCase<SyncContractOptions>;

const SCOPES = {
  users: { name: "users", tables: CORE_SYNC_SCOPE_TABLES.users },
  content: { name: "content", tables: CORE_SYNC_SCOPE_TABLES.content },
  media: { name: "media", tables: CORE_SYNC_SCOPE_TABLES.media },
} satisfies Record<string, SyncScope>;

function openOptions(
  ends: SyncContractEnds,
  target: SyncTarget,
): OpenSyncEndOptions {
  return {
    cwd: process.cwd(),
    config: testConfig(),
    target,
    binding: undefined,
    url: ends.remoteUrl ?? REMOTE_URL,
    apiToken: () => {
      if (ends.apiToken === undefined) {
        return Promise.reject(new Error("the ends were given no API token"));
      }
      return Promise.resolve(ends.apiToken);
    },
    owners: [
      {
        name: "core",
        migrationsFolder: CORE_MIGRATIONS_FOLDER,
        migrationsTable: "__drizzle_migrations_core",
      },
    ],
    targetValues: {},
  };
}

async function withEnd<T>(
  ends: SyncContractEnds,
  target: SyncTarget,
  work: (end: SyncEnd) => Promise<T>,
): Promise<T> {
  const end = await ends.sync.open(openOptions(ends, target));
  try {
    return await work(end);
  } finally {
    await end.close();
  }
}

async function exportFrom(
  ends: SyncContractEnds,
  target: SyncTarget,
  scopes: readonly SyncScope[],
): Promise<DumpReader> {
  return withEnd(ends, target, async (end) => {
    const dump = memoryDump({
      source: { origin: end.origin, basePath: "" },
      scopes: scopes.map((scope) => scope.name),
      heads: await end.heads(),
    });
    await end.exportData(scopes, dump.writer);
    return dump.read();
  });
}

async function importInto(
  ends: SyncContractEnds,
  target: SyncTarget,
  dump: DumpReader,
  scopes: readonly SyncScope[],
  dryRun = false,
): Promise<SyncImportReport> {
  return withEnd(ends, target, (end) =>
    end.importData(dump, scopes, { dryRun }),
  );
}

async function transfer(
  ends: SyncContractEnds,
  from: SyncTarget,
  scopes: readonly SyncScope[],
): Promise<SyncImportReport> {
  const dump = await exportFrom(ends, from, scopes);
  const to = from === "local" ? "remote" : "local";
  return importInto(ends, to, dump, scopes);
}

async function seed(
  site: SyncContractSite,
  statements: readonly (readonly [string, readonly SyncValue[]])[],
): Promise<void> {
  for (const [sql, args] of statements) await site.execute(sql, args);
}

function user(
  id: number,
  email: string,
  role = "editor",
): readonly [string, readonly SyncValue[]] {
  const slug = email.split("@")[0] ?? email;
  return [
    "INSERT INTO users (id, email, slug, name, role) VALUES (?, ?, ?, ?, ?)",
    [id, email, slug, slug, role],
  ];
}

function entry(
  id: number,
  slug: string,
  authorId: number,
  type = "post",
): readonly [string, readonly SyncValue[]] {
  return [
    "INSERT INTO entries (id, type, title, slug, author_id, status) VALUES (?, ?, ?, ?, ?, 'published')",
    [id, type, slug, slug, authorId],
  ];
}

function term(
  id: number,
  slug: string,
): readonly [string, readonly SyncValue[]] {
  return [
    "INSERT INTO terms (id, taxonomy, name, slug) VALUES (?, 'category', ?, ?)",
    [id, slug, slug],
  ];
}

function session(
  id: string,
  userId: number,
): readonly [string, readonly SyncValue[]] {
  return [
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, 4102444800)",
    [id, userId],
  ];
}

function apiToken(
  id: string,
  userId: number,
): readonly [string, readonly SyncValue[]] {
  return [
    "INSERT INTO api_tokens (id, user_id, name, prefix) VALUES (?, ?, 'cli', 'pl_')",
    [id, userId],
  ];
}

const PASSKEY = new Uint8Array([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01]);

async function seedSite(site: SyncContractSite): Promise<void> {
  await seed(site, [
    user(1, "alice@example.test", "admin"),
    user(2, "bob@example.test"),
    [
      "INSERT INTO credentials (id, user_id, public_key, device_type, transports) VALUES (?, ?, ?, 'multi_device', ?)",
      ["cred-alice", 1, PASSKEY, '["internal"]'],
    ],
    term(1, "news"),
    term(2, "notes"),
    [
      "INSERT INTO terms (id, taxonomy, name, slug, parent_id) VALUES (3, 'category', 'Local', 'local', 1)",
      [],
    ],
    entry(1, "hello", 1),
    entry(2, "second", 2),
    [
      "INSERT INTO entries (id, type, title, slug, author_id, parent_id, meta) VALUES (3, 'menu_item', 'Home', 'home', 1, NULL, ?)",
      ['{"entryId":1}'],
    ],
    ["INSERT INTO entry_term (entry_id, term_id) VALUES (1, 1), (2, 3)", []],
    [
      `INSERT INTO settings ("group", key, value) VALUES ('general', 'title', '"Site"')`,
      [],
    ],
  ]);
}

const CONTENT_AND_USERS_TABLES = [
  "users",
  "credentials",
  "terms",
  "entries",
  "entry_term",
  "settings",
];

async function tableRows(
  site: SyncContractSite,
  table: string,
): Promise<readonly SyncRow[]> {
  return site.execute(`SELECT * FROM "${table}" ORDER BY rowid`);
}

async function everyTable(
  site: SyncContractSite,
  tables: readonly string[],
): Promise<Record<string, readonly SyncRow[]>> {
  const rows: Record<string, readonly SyncRow[]> = {};
  for (const table of tables) rows[table] = await tableRows(site, table);
  return rows;
}

/** Records which tables a source writes, without keeping their rows. */
function recordingWriter(): { writer: DumpWriter; tables: string[] } {
  const tables: string[] = [];
  return {
    tables,
    writer: {
      async table(name, rows) {
        tables.push(name);
        for await (const row of rows) void row;
      },
      async authors(rows) {
        for await (const row of rows) void row;
      },
      async object(_key, body) {
        await body.cancel();
      },
    },
  };
}

async function objectBody(
  storage: ConnectedObjectStorage,
  key: string,
): Promise<string | null> {
  const found = await storage.get(key);
  return found === null ? null : new Response(found.body).text();
}

async function objectKeys(storage: ConnectedObjectStorage): Promise<string[]> {
  return (await storage.list()).items.map((item) => item.key).sort();
}

/** Every case of the sync contract, for guard tests that run them outside vitest. */
export const syncContractCases: readonly Case[] = [
  {
    name: "an export imported into an empty database reproduces every table in scope",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);

      await transfer(ends, "local", [SCOPES.users, SCOPES.content]);

      expect(await everyTable(ends.remote, CONTENT_AND_USERS_TABLES)).toEqual(
        await everyTable(ends.local, CONTENT_AND_USERS_TABLES),
      );
    },
  },
  {
    name: "no auth table is ever written to a dump",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);
      await seed(ends.local, [
        session("s-alice", 1),
        apiToken("t-alice", 1),
        [
          "INSERT INTO auth_tokens (hash, type, email, invited_by, expires_at) VALUES ('invite', 'invite', 'carol@example.test', 1, 4102444800)",
          [],
        ],
      ]);
      const recording = recordingWriter();

      await withEnd(ends, "local", (end) =>
        end.exportData([SCOPES.users, SCOPES.content], recording.writer),
      );

      expect(recording.tables).toEqual(CONTENT_AND_USERS_TABLES);
      expect(
        recording.tables.filter((table) => SYNC_AUTH_TABLES.includes(table)),
      ).toEqual([]);
    },
  },
  {
    name: "a dry run writes nothing and reports what the real import then does",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);
      await seed(ends.remote, [
        user(1, "alice@example.test", "admin"),
        entry(1, "remote-hello", 1),
        entry(9, "remote-only", 1),
        term(5, "remote-term"),
      ]);
      const before = await everyTable(ends.remote, CONTENT_AND_USERS_TABLES);
      const dump = await exportFrom(ends, "local", [SCOPES.content]);

      const dryRun = await importInto(
        ends,
        "remote",
        dump,
        [SCOPES.content],
        true,
      );

      expect(await everyTable(ends.remote, CONTENT_AND_USERS_TABLES)).toEqual(
        before,
      );
      expect(await importInto(ends, "remote", dump, [SCOPES.content])).toEqual(
        dryRun,
      );
    },
  },
  {
    name: "an import whose dump is at other heads fails before any write",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);
      await seed(ends.remote, [
        user(1, "alice@example.test", "admin"),
        entry(1, "remote-hello", 1),
      ]);
      const before = await everyTable(ends.remote, CONTENT_AND_USERS_TABLES);
      const dump = await exportFrom(ends, "local", [SCOPES.content]);
      const behind: DumpReader = {
        ...dump,
        rows: (table) => dump.rows(table),
        authors: () => dump.authors(),
        objects: () => dump.objects(),
        manifest: { ...dump.manifest, heads: { core: "1" } },
      };

      await expect(
        importInto(ends, "remote", behind, [SCOPES.content]),
      ).rejects.toMatchObject({ code: "sync_migrations_differ" });
      expect(await everyTable(ends.remote, CONTENT_AND_USERS_TABLES)).toEqual(
        before,
      );
    },
  },
  {
    name: "an author is matched by email, and one the target lacks is added disabled with their role",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seed(ends.remote, [
        user(7, "alice@example.test"),
        user(8, "bob@example.test", "author"),
        entry(1, "by-alice", 7),
        entry(2, "by-bob", 8),
      ]);
      await seed(ends.local, [
        user(1, "zed@example.test"),
        user(2, "alice@example.test"),
      ]);
      const dump = await exportFrom(ends, "remote", [SCOPES.content]);

      const report = await importInto(ends, "local", dump, [SCOPES.content]);

      expect(report.authorsAdded).toEqual(["bob@example.test"]);
      const authors = await ends.local.execute(
        "SELECT e.slug, u.email, u.role, u.meta, u.disabled_at IS NOT NULL AS disabled FROM entries e JOIN users u ON u.id = e.author_id ORDER BY e.id",
      );
      expect(authors).toEqual([
        {
          slug: "by-alice",
          email: "alice@example.test",
          role: "editor",
          meta: "{}",
          disabled: 0,
        },
        {
          slug: "by-bob",
          email: "bob@example.test",
          role: "author",
          meta: "{}",
          disabled: 1,
        },
      ]);
      const alice = await ends.local.execute(
        "SELECT author_id FROM entries WHERE slug = 'by-alice'",
      );
      expect(alice).toEqual([{ author_id: 2 }]);
    },
  },
  {
    name: "an added author whose slug is taken on the target gets a numbered one",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seed(ends.remote, [
        user(8, "bob@example.test"),
        entry(1, "by-bob", 8),
      ]);
      await seed(ends.local, [
        [
          "INSERT INTO users (id, email, slug, role) VALUES (1, 'other@example.test', 'bob', 'editor'), (2, 'more@example.test', 'bob-2', 'editor')",
          [],
        ],
      ]);
      const dump = await exportFrom(ends, "remote", [SCOPES.content]);

      await importInto(ends, "local", dump, [SCOPES.content]);

      expect(
        await ends.local.execute(
          "SELECT slug FROM users WHERE email = 'bob@example.test'",
        ),
      ).toEqual([{ slug: "bob-3" }]);
    },
  },
  {
    name: "rows outside the sync that reference replaced rows are removed or cleared, and counted",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);
      await seed(ends.remote, [
        user(4, "carol@example.test", "admin"),
        session("s-carol", 4),
        [
          "INSERT INTO auth_tokens (hash, type, email, invited_by, expires_at) VALUES ('invite', 'invite', 'dan@example.test', 4, 4102444800)",
          [],
        ],
      ]);

      const report = await transfer(ends, "local", [
        SCOPES.users,
        SCOPES.content,
      ]);

      // A remote end's own operator token goes too when its user's email is
      // not in the dump, so `api_tokens` is the transport's to report.
      expect(
        report.dependents.filter(
          (dependent) => dependent.table !== "api_tokens",
        ),
      ).toEqual([
        { table: "auth_tokens", removed: 0, cleared: 1 },
        { table: "sessions", removed: 1, cleared: 0 },
      ]);
      expect(
        await ends.remote.execute("SELECT hash, invited_by FROM auth_tokens"),
      ).toEqual([{ hash: "invite", invited_by: null }]);
    },
  },
  {
    name: "a users replace keeps the target's sessions and tokens whose user's email is in the dump",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await seedSite(ends.local);
      await seed(ends.remote, [
        user(5, "alice@example.test", "admin"),
        session("s-alice", 5),
        apiToken("t-alice", 5),
      ]);

      await transfer(ends, "local", [SCOPES.users, SCOPES.content]);

      expect(
        await ends.remote.execute(
          "SELECT 'session' AS kind, id, user_id FROM sessions UNION ALL SELECT 'token', id, user_id FROM api_tokens ORDER BY kind",
        ),
      ).toEqual([
        { kind: "session", id: "s-alice", user_id: 1 },
        { kind: "token", id: "t-alice", user_id: 1 },
      ]);
    },
  },
  {
    name: "a media replace leaves the target holding exactly the source's objects",
    run: async (options) => {
      const ends = await options.open(new HookRegistry());
      await ends.local.storage.put("a.txt", "local a", {
        contentType: "text/plain",
      });
      await ends.local.storage.put("b.txt", "local b");
      await ends.remote.storage.put("b.txt", "remote b");
      await ends.remote.storage.put("c.txt", "remote c");

      await transfer(ends, "local", [SCOPES.media]);

      expect(await objectKeys(ends.remote.storage)).toEqual(["a.txt", "b.txt"]);
      expect(await objectBody(ends.remote.storage, "b.txt")).toBe("local b");
      expect((await ends.remote.storage.head("a.txt"))?.contentType).toBe(
        "text/plain",
      );
    },
  },
  {
    name: "settle reports a failed listener as a step and still resolves",
    run: async (options) => {
      const hooks = new HookRegistry();
      hooks.on(
        sync.after,
        () => {
          throw new Error("listener failed");
        },
        { plugin: "conformance" },
      );
      const ends = await options.open(hooks);

      const report = await withEnd(ends, "remote", (end) =>
        end.settle({ scopes: ["content"], direction: "push" }),
      );

      expect(report.failures).toContainEqual({
        step: "plugin:conformance",
        message: "listener failed",
      });
    },
  },
];

/** Assert a runtime's `sync` export satisfies the transport contract. */
export function describeSyncContract(options: SyncContractOptions): void {
  describeContract("sync contract", syncContractCases, options);
}
