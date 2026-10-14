import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type {
  CommandContext,
  ConnectedCdn,
  PlumixApp,
  RuntimeSync,
  SyncEnd,
} from "@plumix/core";
import type { MemorySyncEnd, MemorySyncEnds } from "@plumix/core/test";
import { HookRegistry } from "@plumix/core";
import { entries } from "@plumix/core/schema";
import { createDispatcherHarness, memorySyncEnds } from "@plumix/core/test";

import { report } from "../report.js";
import { syncCommand, syncDeps } from "./sync.js";

const REMOTE = "https://example.com";

let base: PlumixApp;
beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

let dir: string;
let lines: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-sync-"));
  lines = [];
  for (const method of ["info", "success", "hint"] as const) {
    vi.spyOn(report, method).mockImplementation((line: string) => {
      lines.push(line);
    });
  }
  vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);
  vi.spyOn(syncDeps, "now").mockReturnValue(
    new Date("2026-10-14T09:30:00.000Z"),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function syncCtx(
  argv: readonly string[],
  runtimeSync: RuntimeSync | undefined,
  app: PlumixApp = base,
): CommandContext {
  return {
    app,
    cwd: dir,
    configPath: join(dir, "plumix.config.ts"),
    argv,
    runtimeSync,
  };
}

type Call = string;

/** Passes each call through to `sync`, recording it as `<target>.<method>`. */
function recording(sync: RuntimeSync): { sync: RuntimeSync; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    sync: {
      async open(options) {
        calls.push(`${options.target}.open`);
        const end = await sync.open(options);
        const record =
          <K extends keyof SyncEnd>(method: K) =>
          (...args: unknown[]): unknown => {
            calls.push(`${options.target}.${method}`);
            return (end[method] as (...a: unknown[]) => unknown)(...args);
          };
        return {
          origin: end.origin,
          heads: record("heads") as SyncEnd["heads"],
          exportData: record("exportData") as SyncEnd["exportData"],
          importData: record("importData") as SyncEnd["importData"],
          snapshot: record("snapshot") as SyncEnd["snapshot"],
          restoreHint: record("restoreHint") as SyncEnd["restoreHint"],
          settle: record("settle") as SyncEnd["settle"],
          close: record("close") as SyncEnd["close"],
        };
      },
    },
  };
}

async function seed(
  site: MemorySyncEnd,
  statements: readonly string[],
): Promise<void> {
  for (const sql of statements) await site.execute(sql);
}

const AUTHOR = `INSERT INTO users (id, email, slug, role) VALUES (1, 'alice@example.com', 'alice', 'admin')`;

async function seededEnds(
  options: Parameters<typeof memorySyncEnds>[0] = {},
): Promise<MemorySyncEnds> {
  const ends = await memorySyncEnds(options);
  await seed(ends.local, [
    AUTHOR,
    "INSERT INTO terms (id, taxonomy, name, slug) VALUES (1, 'category', 'News', 'news')",
    "INSERT INTO entries (id, type, title, slug, author_id) VALUES (1, 'post', 'Hello', 'hello', 1)",
    "INSERT INTO entry_term (entry_id, term_id) VALUES (1, 1)",
  ]);
  await seed(ends.remote, [AUTHOR]);
  return ends;
}

function dumpsLeft(): string[] {
  const root = join(dir, ".plumix/sync");
  return existsSync(root) ? readdirSync(root) : [];
}

describe("plumix sync, before anything opens", () => {
  test("a push without --yes on a non-TTY fails before any end is opened", async () => {
    const ends = recording((await memorySyncEnds()).sync);

    await expect(
      syncCommand.run(syncCtx(["push", "--url", REMOTE], ends.sync)),
    ).rejects.toMatchObject({ code: "sync_push_unconfirmed" });
    expect(ends.calls).toEqual([]);
  });

  test("--scope users alone fails with sync_scope_requires before any end is opened", async () => {
    const ends = recording((await memorySyncEnds()).sync);

    await expect(
      syncCommand.run(
        syncCtx(["pull", "--scope", "users", "--url", REMOTE], ends.sync),
      ),
    ).rejects.toMatchObject({ code: "sync_scope_requires" });
    expect(ends.calls).toEqual([]);
  });

  test("--scope plugin:comments without content fails with sync_scope_requires before any end is opened", async () => {
    const comments = sqliteTable("comments", {
      id: integer().primaryKey(),
      entryId: integer("entry_id").references(() => entries.id),
    });
    const app: PlumixApp = {
      ...base,
      config: {
        ...base.config,
        plugins: [
          { id: "comments", setup: () => undefined, schema: { comments } },
        ],
      },
    };
    const ends = recording((await memorySyncEnds()).sync);

    await expect(
      syncCommand.run(
        syncCtx(
          ["pull", "--scope", "plugin:comments", "--url", REMOTE],
          ends.sync,
          app,
        ),
      ),
    ).rejects.toMatchObject({
      code: "sync_scope_requires",
      message: expect.stringContaining("plugin:comments") as unknown,
    });
    expect(ends.calls).toEqual([]);
  });

  test("a runtime with no sync export fails naming the runtime", async () => {
    await expect(
      syncCommand.run(syncCtx(["pull", "--url", REMOTE], undefined)),
    ).rejects.toMatchObject({
      code: "sync_runtime_unsupported",
      message: expect.stringContaining(base.config.runtime.name) as unknown,
    });
  });

  test("fails without --url, since one end is always the deployed site", async () => {
    const ends = recording((await memorySyncEnds()).sync);

    await expect(
      syncCommand.run(syncCtx(["pull"], ends.sync)),
    ).rejects.toMatchObject({ code: "sync_remote_url_required" });
    expect(ends.calls).toEqual([]);
  });

  test("an unknown direction fails naming pull and push", async () => {
    await expect(
      syncCommand.run(syncCtx(["sideways"], undefined)),
    ).rejects.toMatchObject({
      code: "unknown_subcommand",
      hint: expect.stringContaining("plumix sync push") as unknown,
    });
  });
});

describe("plumix sync", () => {
  test("a head mismatch fails before the export", async () => {
    const ends = await seededEnds();
    await ends.remote.execute(
      "INSERT INTO __drizzle_migrations_core (hash, created_at) VALUES ('ahead', 9999999999999)",
    );
    const recorded = recording(ends.sync);

    await expect(
      syncCommand.run(
        syncCtx(["push", "--url", REMOTE, "--yes"], recorded.sync),
      ),
    ).rejects.toMatchObject({
      code: "sync_migrations_differ",
      message: expect.stringContaining(
        "core: local is behind remote",
      ) as unknown,
    });
    expect(recorded.calls).not.toContain("local.exportData");
    expect(dumpsLeft()).toEqual([]);
  });

  test("--dry-run prints each table's counts and the dependents a push would remove, and changes nothing", async () => {
    const ends = await seededEnds();
    await seed(ends.remote, [
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (5, 'post', 'Old', 'old', 1)",
      "CREATE TABLE comments (id INTEGER PRIMARY KEY, entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE)",
      "INSERT INTO comments (id, entry_id) VALUES (1, 5), (2, 5)",
    ]);

    await syncCommand.run(
      syncCtx(["push", "--url", REMOTE, "--dry-run"], ends.sync),
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        "  entries: 0 replaced, 1 added, 1 removed",
        "  comments: 2 removed, 0 cleared",
        "Dry run: nothing was changed.",
      ]),
    );
    expect(
      await ends.remote.execute("SELECT count(*) AS n FROM comments"),
    ).toEqual([{ n: 2 }]);
    expect(await ends.remote.execute("SELECT id FROM entries")).toEqual([
      { id: 5 },
    ]);
  });

  test("a pull's dry run lists the authors it would add as disabled users", async () => {
    const ends = await memorySyncEnds();
    await seed(ends.remote, [
      "INSERT INTO users (id, email, slug, role) VALUES (7, 'alice@example.com', 'alice', 'editor'), (8, 'bob@example.com', 'bob', 'author')",
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (1, 'post', 'A', 'a', 7), (2, 'post', 'B', 'b', 8)",
    ]);
    await seed(ends.local, [
      "INSERT INTO users (id, email, slug, role) VALUES (2, 'alice@example.com', 'alice', 'editor')",
    ]);

    await syncCommand.run(
      syncCtx(["pull", "--url", REMOTE, "--dry-run"], ends.sync),
    );

    expect(lines).toContain(
      "Authors to add as disabled users: bob@example.com",
    );
  });

  test("a content push reproduces the local entry_term exactly, with no remote media link left over", async () => {
    const ends = await seededEnds();
    await seed(ends.remote, [
      "INSERT INTO terms (id, taxonomy, name, slug) VALUES (1, 'category', 'News', 'news')",
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (9, 'media', 'Photo', 'photo', 1)",
      "INSERT INTO entry_term (entry_id, term_id) VALUES (9, 1)",
    ]);

    await syncCommand.run(
      syncCtx(["push", "--url", REMOTE, "--yes"], ends.sync),
    );

    const order = "SELECT * FROM entry_term ORDER BY rowid";
    expect(await ends.remote.execute(order)).toEqual(
      await ends.local.execute(order),
    );
  });

  test("a push snapshots the remote before it imports, and prints the restore hint", async () => {
    const ends = await seededEnds();
    const recorded = recording(ends.sync);

    await syncCommand.run(
      syncCtx(["push", "--url", REMOTE, "--yes"], recorded.sync),
    );

    const remoteCalls = recorded.calls.filter((call) =>
      ["remote.snapshot", "remote.importData"].includes(call),
    );
    expect(remoteCalls).toEqual([
      "remote.importData",
      "remote.snapshot",
      "remote.importData",
    ]);
    expect(lines).toContain(
      "This in-memory end takes no snapshot: its import is one transaction, so a failed one changes nothing.",
    );
  });

  test("fires sync:after once, with the scopes and the direction", async () => {
    const hooks = new HookRegistry();
    const events: unknown[] = [];
    hooks.addAction("sync:after", (event) => {
      events.push(event);
    });
    const ends = await seededEnds({ hooks });

    await syncCommand.run(
      syncCtx(
        [
          "push",
          "--scope",
          "content",
          "--scope",
          "media",
          "--url",
          REMOTE,
          "--yes",
        ],
        ends.sync,
      ),
    );

    expect(events).toEqual([
      { scopes: ["content", "media"], direction: "push" },
    ]);
  });

  test("a push whose settle fails reports every failed step after the import committed", async () => {
    const hooks = new HookRegistry();
    hooks.addAction(
      "sync:after",
      () => {
        throw new Error("index unreachable");
      },
      { plugin: "search" },
    );
    const cdn: ConnectedCdn = {
      decorate: (response) => response,
      purgeAll: () => Promise.reject(new Error("zone refused")),
    };
    const ends = await seededEnds({ hooks, remoteCdn: cdn });

    await expect(
      syncCommand.run(syncCtx(["push", "--url", REMOTE, "--yes"], ends.sync)),
    ).rejects.toMatchObject({
      code: "sync_settle_failed",
      message: expect.stringMatching(
        /plugin:search: index unreachable[\s\S]*cdn: zone refused/,
      ) as unknown,
    });
    expect(await ends.remote.execute("SELECT slug FROM entries")).toEqual([
      { slug: "hello" },
    ]);
  });

  test("a pull of users keeps the local admin's email on an admin holding their local passkey", async () => {
    const ends = await memorySyncEnds();
    await seed(ends.local, [
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'me@example.com', 'me', 'admin')",
      "INSERT INTO credentials (id, user_id, public_key, device_type) VALUES ('local-passkey', 1, x'01', 'multi_device')",
    ]);
    await seed(ends.remote, [
      "INSERT INTO users (id, email, slug, role) VALUES (5, 'me@example.com', 'me', 'editor'), (6, 'you@example.com', 'you', 'admin')",
      "INSERT INTO credentials (id, user_id, public_key, device_type) VALUES ('remote-passkey', 5, x'05', 'multi_device')",
    ]);

    await syncCommand.run(
      syncCtx(
        ["pull", "--scope", "users", "--scope", "content", "--url", REMOTE],
        ends.sync,
      ),
    );

    expect(
      await ends.local.execute(
        "SELECT u.email, u.role, c.id AS passkey FROM users u JOIN credentials c ON c.user_id = u.id",
      ),
    ).toEqual([
      { email: "me@example.com", role: "admin", passkey: "local-passkey" },
    ]);
  });

  test("a push on a terminal asks first, and 'no' changes nothing", async () => {
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
    const confirm = vi.spyOn(syncDeps, "confirm").mockResolvedValue(false);
    const ends = await seededEnds();

    await syncCommand.run(syncCtx(["push", "--url", REMOTE], ends.sync));

    expect(confirm).toHaveBeenCalledOnce();
    expect(
      await ends.remote.execute("SELECT count(*) AS n FROM entries"),
    ).toEqual([{ n: 0 }]);
  });

  test("deletes its dump after a sync that succeeds", async () => {
    const ends = await seededEnds();

    await syncCommand.run(
      syncCtx(["push", "--url", REMOTE, "--yes"], ends.sync),
    );

    expect(dumpsLeft()).toEqual([]);
  });

  test("keeps its dump after a sync that fails, and prints where", async () => {
    const hooks = new HookRegistry();
    hooks.addAction("sync:after", () => Promise.reject(new Error("boom")));
    const ends = await seededEnds({ hooks });

    await expect(
      syncCommand.run(syncCtx(["push", "--url", REMOTE, "--yes"], ends.sync)),
    ).rejects.toMatchObject({ code: "sync_settle_failed" });

    expect(dumpsLeft()).toEqual(["push-20261014T093000Z"]);
    expect(lines).toContain(
      "The dump is kept at .plumix/sync/push-20261014T093000Z",
    );
  });

  test("says when the CDN can't purge everything", async () => {
    const ends = await seededEnds({
      remoteCdn: { decorate: (response) => response },
    });

    await syncCommand.run(
      syncCtx(["push", "--url", REMOTE, "--yes"], ends.sync),
    );

    expect(lines).toContain(
      "The CDN can't purge everything, so cached pages refresh as their ttl runs out.",
    );
  });
});
