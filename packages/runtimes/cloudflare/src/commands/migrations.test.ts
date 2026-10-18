import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MigrationLocation, PlumixApp, TargetOptionValues } from "plumix";
import type { GetPlatformProxyOptions, PlatformProxy } from "wrangler";
import { createDispatcherHarness } from "plumix/test";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { d1 } from "../d1.js";
import { migrations, migrationsDeps } from "./migrations.js";

const D1_ENTRY = {
  binding: "DB",
  database_name: "site",
  database_id: "11111111-1111-1111-1111-111111111111",
};

let app: PlumixApp;
let dir: string;

beforeAll(async () => {
  ({ app } = await createDispatcherHarness());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-cf-migrations-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function writeWrangler(d1: readonly object[]): void {
  writeFileSync(
    join(dir, "wrangler.jsonc"),
    JSON.stringify({
      name: "site",
      main: ".plumix/worker.ts",
      compatibility_date: "2026-04-01",
      account_id: "acc123",
      d1_databases: d1,
    }),
  );
}

const open = (location: MigrationLocation, binding?: string) =>
  migrations.open({
    cwd: dir,
    config: app.config,
    location,
    binding,
    targetValues: {},
  });

function writeConfig(config: object): void {
  writeFileSync(
    join(dir, "wrangler.jsonc"),
    JSON.stringify({
      name: "site",
      compatibility_date: "2026-04-01",
      account_id: "acc123",
      ...config,
    }),
  );
}

const d1Entry = (name: string, id: string) => ({
  binding: "DB",
  database_name: name,
  database_id: id,
});

const PRODUCTION_D1 = d1Entry("site-prod", "prod-id");
const PREVIEW_D1 = d1Entry("site-preview", "preview-id");

const openTarget = (target: TargetOptionValues) =>
  migrations.open({
    cwd: dir,
    config: { ...app.config, database: d1({ binding: "DB" }) },
    location: "site",
    binding: undefined,
    targetValues: target,
  });

/** The database a remote open reaches, and the line it is announced by. */
async function reached(
  target: TargetOptionValues,
): Promise<{ database: unknown; summary: string; notes: readonly string[] }> {
  const calls = stubWrangler();
  const db = await openTarget(target);
  await db.close();
  const [call] = calls;
  return {
    database: (call?.config as { d1_databases: unknown[] }).d1_databases[0],
    summary: db.target.summary,
    notes: db.target.notes,
  };
}

interface WranglerCall {
  options: GetPlatformProxyOptions;
  config: unknown;
}

/**
 * Stands in for wrangler's `getPlatformProxy`, recording the options and the
 * config file Plumix hands it. The file is read at call time: `close()`
 * deletes it.
 */
function stubWrangler(binding: object = {}): WranglerCall[] {
  const calls: WranglerCall[] = [];
  vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation((options) => {
    const config = JSON.parse(
      readFileSync(options.configPath ?? "", "utf8"),
    ) as { d1_databases: { binding: string }[] };
    calls.push({ options, config });
    const name = config.d1_databases[0]?.binding ?? "";
    return Promise.resolve({
      env: { [name]: binding },
      dispose: () => Promise.resolve(),
    } as unknown as PlatformProxy);
  });
  return calls;
}

describe("a wipe of the local D1, on workerd", () => {
  // wrangler loads on first use, and a cold load alone can outlast a test.
  beforeAll(async () => {
    await import("wrangler");
  });

  test("drops every table, foreign keys and tracking tables included, and leaves D1's own", async () => {
    writeWrangler([D1_ENTRY]);
    const db = await open("site");
    try {
      await db.migrate({
        migrationsFolder: fileURLToPath(
          new URL("../../../../core/migrations", import.meta.url),
        ),
        migrationsTable: "__drizzle_migrations_core",
      });
      await db.batch(
        [
          "CREATE TABLE parent (id integer PRIMARY KEY AUTOINCREMENT)",
          "CREATE TABLE child (parent_id integer REFERENCES parent (id) ON DELETE CASCADE)",
          "CREATE TABLE child_log (parent_id integer)",
          "CREATE TRIGGER child_deleted AFTER DELETE ON child BEGIN INSERT INTO child_log VALUES (old.parent_id); END",
          "CREATE VIRTUAL TABLE notes USING fts5(body)",
          "INSERT INTO parent DEFAULT VALUES",
          "INSERT INTO child (parent_id) VALUES (1)",
        ].map((sql) => ({ sql, params: [] })),
      );

      await db.wipe();

      const left = await db.all(
        "SELECT type, name FROM sqlite_master ORDER BY name",
      );
      expect(
        left.filter(({ name }) => !String(name).startsWith("_cf_")),
      ).toEqual([{ type: "table", name: "sqlite_sequence" }]);
      expect(left.length).toBeGreaterThan(1);
    } finally {
      await db.close();
    }
  });
});

describe("cloudflare migrations", () => {
  test("opens the local D1 `plumix dev` reads, persisted under the project's .wrangler/state", async () => {
    writeWrangler([D1_ENTRY]);
    const calls = stubWrangler();

    const db = await open("site");
    await db.close();

    expect(calls).toEqual([
      {
        options: {
          configPath: expect.any(String) as unknown,
          persist: { path: join(dir, ".wrangler/state/v3") },
          remoteBindings: false,
        },
        config: {
          name: "plumix-migrate",
          compatibility_date: "2026-04-01",
          account_id: "acc123",
          d1_databases: [D1_ENTRY],
        },
      },
    ]);
  });

  test("its drizzle runs a data migration's SQL on the D1 binding wrangler hands back", async () => {
    writeWrangler([D1_ENTRY]);
    const prepared: string[] = [];
    const statement = {
      bind: () => statement,
      run: () => Promise.resolve({ success: true, results: [], meta: {} }),
    };
    stubWrangler({
      prepare: (sql: string) => {
        prepared.push(sql);
        return statement;
      },
    });

    const db = await open("site");
    await db.drizzle.run("UPDATE settings SET key = 'beta'");
    await db.close();

    expect(prepared).toEqual(["UPDATE settings SET key = 'beta'"]);
  });

  test("a memory database persists nothing", async () => {
    writeWrangler([D1_ENTRY]);
    const calls = stubWrangler();

    const db = await open("memory");
    await db.close();

    expect(calls).toEqual([
      {
        options: {
          configPath: expect.any(String) as unknown,
          persist: false,
          remoteBindings: false,
        },
        config: {
          name: "plumix-migrate",
          compatibility_date: "2026-04-01",
          account_id: "acc123",
          d1_databases: [D1_ENTRY],
        },
      },
    ]);
  });

  test("--production reaches the top level's database through wrangler's remote bindings", async () => {
    writeWrangler([D1_ENTRY]);
    const calls = stubWrangler();

    const db = await openTarget({ production: true });
    await db.close();

    expect(calls).toEqual([
      {
        options: {
          configPath: expect.any(String) as unknown,
          persist: false,
          remoteBindings: true,
        },
        config: {
          name: "plumix-migrate",
          compatibility_date: "2026-04-01",
          account_id: "acc123",
          d1_databases: [{ ...D1_ENTRY, remote: true }],
        },
      },
    ]);
  });

  test("a remote open reaches database_id, never the preview_database_id wrangler dev uses", async () => {
    writeConfig({
      d1_databases: [{ ...PRODUCTION_D1, preview_database_id: "dev-id" }],
    });

    const { database } = await reached({ production: true });

    expect(database).toEqual({ ...PRODUCTION_D1, remote: true });
  });

  test("with several D1 bindings, requires --binding and names the ones it found", async () => {
    writeWrangler([D1_ENTRY, { ...D1_ENTRY, binding: "ARCHIVE" }]);

    await expect(open("site")).rejects.toMatchObject({
      code: "migrate_ambiguous_binding",
      message: expect.stringContaining("DB, ARCHIVE") as unknown,
    });
  });

  test("with several D1 bindings, --binding opens the one it names", async () => {
    writeWrangler([
      D1_ENTRY,
      { ...D1_ENTRY, binding: "ARCHIVE", database_name: "archive" },
    ]);
    const calls = stubWrangler();

    const db = await open("site", "ARCHIVE");
    await db.close();

    expect(calls).toEqual([
      {
        options: {
          configPath: expect.any(String) as unknown,
          persist: { path: join(dir, ".wrangler/state/v3") },
          remoteBindings: false,
        },
        config: {
          name: "plumix-migrate",
          compatibility_date: "2026-04-01",
          account_id: "acc123",
          d1_databases: [
            { ...D1_ENTRY, binding: "ARCHIVE", database_name: "archive" },
          ],
        },
      },
    ]);
  });

  test("with several D1 bindings and no --binding, opens the one the config's d1() slot names", async () => {
    writeWrangler([
      D1_ENTRY,
      { ...D1_ENTRY, binding: "ARCHIVE", database_name: "archive" },
    ]);
    const calls = stubWrangler();

    const db = await migrations.open({
      cwd: dir,
      config: { ...app.config, database: d1({ binding: "ARCHIVE" }) },
      location: "memory",
      binding: undefined,
      targetValues: {},
    });
    await db.close();

    expect(calls).toEqual([
      {
        options: {
          configPath: expect.any(String) as unknown,
          persist: false,
          remoteBindings: false,
        },
        config: {
          name: "plumix-migrate",
          compatibility_date: "2026-04-01",
          account_id: "acc123",
          d1_databases: [
            { ...D1_ENTRY, binding: "ARCHIVE", database_name: "archive" },
          ],
        },
      },
    ]);
  });

  test("refuses a --binding the config does not declare", async () => {
    writeWrangler([D1_ENTRY]);

    await expect(open("site", "NOPE")).rejects.toMatchObject({
      code: "migrate_unknown_binding",
    });
  });

  test("refuses a project with no D1 binding", async () => {
    writeWrangler([]);

    await expect(open("site")).rejects.toMatchObject({
      code: "migrate_no_d1",
    });
  });
});

describe("cloudflare migrations — the database a target names", () => {
  test("--production names the top level when there is no env.production", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      env: { qa: { d1_databases: [d1Entry("site-qa", "qa-id")] } },
    });

    expect(await reached({ production: true })).toEqual({
      database: { ...PRODUCTION_D1, remote: true },
      summary: "production (top level) · DB · site-prod",
      notes: [],
    });
  });

  test("--production names env.production when the config defines it", async () => {
    writeConfig({
      d1_databases: [d1Entry("site-top", "top-id")],
      env: { production: { d1_databases: [PRODUCTION_D1] } },
    });

    expect(await reached({ production: true })).toEqual({
      database: { ...PRODUCTION_D1, remote: true },
      summary: "production (env.production) · DB · site-prod",
      notes: [],
    });
  });

  test("--env qa names env.qa's database", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      env: { qa: { d1_databases: [d1Entry("site-qa", "qa-id")] } },
    });

    expect(await reached({ env: "qa" })).toEqual({
      database: { ...d1Entry("site-qa", "qa-id"), remote: true },
      summary: "qa (env.qa) · DB · site-qa",
      notes: [],
    });
  });

  test("an env without d1_databases fails before connecting, naming the block and the binding", async () => {
    writeConfig({ d1_databases: [PRODUCTION_D1], env: { qa: {} } });
    const calls = stubWrangler();

    await expect(openTarget({ env: "qa" })).rejects.toMatchObject({
      code: "migrate_no_d1",
      message: 'env.qa in wrangler.jsonc binds no D1 database as "DB"',
      hint: expect.stringContaining(
        '"d1_databases": [{ "binding": "DB", "database_name": "<name>", "database_id": "<id>" }]',
      ) as unknown,
    });
    expect(calls).toEqual([]);
  });

  test("--preview names the top-level previews database, which other Previews share", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      previews: { d1_databases: [PREVIEW_D1] },
    });

    expect(await reached({ preview: true })).toEqual({
      database: { ...PREVIEW_D1, remote: true },
      summary: "preview (top-level previews) · DB · site-preview",
      notes: [
        "Every Worker Preview without a previews block of its own uses this database too.",
      ],
    });
  });

  test("--env qa --preview names env.qa's own previews database", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      previews: { d1_databases: [PREVIEW_D1] },
      env: {
        qa: {
          d1_databases: [d1Entry("site-qa", "qa-id")],
          previews: { d1_databases: [d1Entry("qa-preview", "qa-preview-id")] },
        },
      },
    });

    expect(await reached({ env: "qa", preview: true })).toEqual({
      database: { ...d1Entry("qa-preview", "qa-preview-id"), remote: true },
      summary: "preview (env.qa.previews) · DB · qa-preview",
      notes: [],
    });
  });

  test("--env qa --preview inherits the top-level previews when env.qa has none", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      previews: { d1_databases: [PREVIEW_D1] },
      env: { qa: { d1_databases: [d1Entry("site-qa", "qa-id")] } },
    });

    expect(await reached({ env: "qa", preview: true })).toEqual({
      database: { ...PREVIEW_D1, remote: true },
      summary:
        "preview (env.qa, previews inherited from top level) · DB · site-preview",
      notes: [
        "Every Worker Preview without a previews block of its own uses this database too.",
      ],
    });
  });

  test("a remote database's restore point is its Time Travel bookmark now, with the command that restores it", async () => {
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      previews: { d1_databases: [PREVIEW_D1] },
    });
    stubWrangler();
    const bookmark = vi
      .spyOn(migrationsDeps, "timeTravelBookmark")
      .mockResolvedValue("00000085-0000024c");

    const db = await openTarget({ preview: true });
    const line = await db.restorePoint?.();
    await db.close();

    expect(db.target.name).toBe("site-preview");
    expect(bookmark).toHaveBeenCalledWith(dir, "site-preview");
    expect(line).toBe(
      "Restore point: D1 Time Travel bookmark 00000085-0000024c. To undo the wipe, run `wrangler d1 time-travel restore site-preview --bookmark=00000085-0000024c`.",
    );
  });

  test("the local D1 has no restore point", async () => {
    writeWrangler([D1_ENTRY]);
    stubWrangler();

    const db = await open("site");
    await db.close();

    expect("restorePoint" in db).toBe(false);
  });

  test("--production together with --env fails before connecting", async () => {
    writeConfig({ d1_databases: [PRODUCTION_D1] });
    const calls = stubWrangler();

    await expect(
      openTarget({ production: true, env: "qa" }),
    ).rejects.toMatchObject({ code: "migrate_target_conflict" });
    expect(calls).toEqual([]);
  });

  test("CLOUDFLARE_ENV names the environment --preview reaches", async () => {
    vi.stubEnv("CLOUDFLARE_ENV", "qa");
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      env: {
        qa: {
          d1_databases: [d1Entry("site-qa", "qa-id")],
          previews: { d1_databases: [d1Entry("qa-preview", "qa-preview-id")] },
        },
      },
    });

    const { summary } = await reached({ preview: true });

    expect(summary).toBe("preview (env.qa.previews) · DB · qa-preview");
  });

  test("--env wins over CLOUDFLARE_ENV", async () => {
    vi.stubEnv("CLOUDFLARE_ENV", "staging");
    writeConfig({
      d1_databases: [PRODUCTION_D1],
      env: {
        qa: { d1_databases: [d1Entry("site-qa", "qa-id")] },
        staging: { d1_databases: [d1Entry("site-staging", "staging-id")] },
      },
    });

    const { summary } = await reached({ env: "qa" });

    expect(summary).toBe("qa (env.qa) · DB · site-qa");
  });

  test("a local open is announced by its binding and database", async () => {
    writeConfig({ d1_databases: [PRODUCTION_D1] });

    const { summary } = await reached({});

    expect(summary).toBe("local · DB · site-prod");
  });
});
