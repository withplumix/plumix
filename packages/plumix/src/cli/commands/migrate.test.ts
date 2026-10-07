import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
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
  MigrationDatabase,
  MigrationLocation,
  PlumixApp,
  RuntimeMigrations,
} from "@plumix/core";
import { CORE_MIGRATIONS_FOLDER } from "@plumix/core/cli";
import { createDispatcherHarness } from "@plumix/core/test";

import { report } from "../report.js";
import { migrateCommand, migrateGenerateDeps } from "./migrate.js";

let base: PlumixApp;
beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

function appWith(plugins: PlumixApp["config"]["plugins"]): PlumixApp {
  return { ...base, config: { ...base.config, plugins } };
}

function ctx(overrides: Partial<CommandContext>): CommandContext {
  return {
    app: base,
    cwd: process.cwd(),
    configPath: join(process.cwd(), "plumix.config.ts"),
    argv: [],
    ...overrides,
  };
}

describe("migrate dispatch", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("unknown subcommand surfaces the available list in the hint", async () => {
    await expect(
      migrateCommand.run(
        ctx({
          cwd: dir,
          argv: ["nope"],
        }),
      ),
    ).rejects.toMatchObject({
      code: "unknown_subcommand",
      hint: expect.stringContaining("plumix migrate fresh") as unknown,
    });
  });

  test("inherited prototype names fall through to unknown_subcommand", async () => {
    for (const sub of ["__proto__", "constructor", "toString"]) {
      await expect(
        migrateCommand.run(ctx({ cwd: dir, argv: [sub] })),
      ).rejects.toMatchObject({ code: "unknown_subcommand" });
    }
  });
});

describe("migrate generate", () => {
  let dir: string;
  let lines: string[];

  // A site whose local plugin declares a table, beside a plugin package
  // whose tables are in the history it ships.
  const LOCAL = {
    id: "local",
    setup: () => undefined,
    schemaModule: "../src/schema.ts",
  };
  const PACKAGED = {
    id: "widgets",
    setup: () => undefined,
    schemaModule: "@acme/plugin-widgets/schema",
  };

  function installWidgets(): void {
    const root = join(dir, "node_modules/@acme/plugin-widgets");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "@acme/plugin-widgets",
        exports: { "./schema": "./schema.js" },
      }),
    );
    writeFileSync(join(root, "schema.js"), "export {};\n");
  }

  function generateCtx(
    plugins: PlumixApp["config"]["plugins"],
    argv: readonly string[] = ["generate"],
  ): CommandContext {
    return ctx({
      cwd: dir,
      configPath: join(dir, "plumix.config.ts"),
      argv,
      app: appWith(plugins),
    });
  }

  function mockDrizzleKit(stderr = "") {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    return vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockResolvedValue(stderr);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-gen-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
    installWidgets();
    lines = [];
    vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
    vi.spyOn(report, "success").mockImplementation((line) => lines.push(line));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("writes nothing and says so when the site owns no tables", async () => {
    const spawn = mockDrizzleKit();

    await migrateCommand.run(generateCtx([PACKAGED]));

    expect(spawn).not.toHaveBeenCalled();
    expect(readdirSync(dir).sort()).toEqual(["node_modules", "package.json"]);
    expect(lines).toEqual([
      "This site owns no tables: no plugin's schemaModule resolves inside it, so there is nothing to generate.",
    ]);
  });

  test("ignores arguments it never read, as it did before apply took flags", async () => {
    const spawn = mockDrizzleKit();

    await migrateCommand.run(
      generateCtx([LOCAL], ["generate", "--name", "x", "extra"]),
    );

    expect(spawn).toHaveBeenCalledOnce();
  });

  test("re-exports only the site's own schema modules, then spawns drizzle-kit generate into migrations/", async () => {
    const spawn = mockDrizzleKit();

    await migrateCommand.run(generateCtx([PACKAGED, LOCAL]));

    expect(readFileSync(join(dir, ".plumix/site-schema.ts"), "utf8")).toBe(
      '// Generated by plumix migrate generate — do not edit.\n\nexport * from "../src/schema.ts";\n',
    );
    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, options] = spawn.mock.calls[0] ?? [];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      "--no-warnings",
      "/fake/drizzle-kit/bin.cjs",
      "generate",
      "--dialect",
      "sqlite",
      "--casing",
      "snake_case",
      "--schema",
      ".plumix/site-schema.ts",
      "--out",
      "migrations",
    ]);
    // NODE_OPTIONS / NODE_DEBUG are stripped so nothing inherited writes
    // to the stderr this command reads failure from.
    expect(options).toEqual({
      cwd: dir,
      env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined },
    });
  });

  test("throws a structured CliError when drizzle-kit is not installed", async () => {
    const spawn = mockDrizzleKit();
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(null);

    await expect(
      migrateCommand.run(generateCtx([LOCAL])),
    ).rejects.toMatchObject({
      code: "migrate_generate_no_drizzle_kit",
      hint: expect.stringContaining("ships with plumix") as unknown,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("fails when drizzle-kit reports an error but exits zero", async () => {
    mockDrizzleKit("Error: Interactive prompts require a TTY terminal\n");

    await expect(
      migrateCommand.run(generateCtx([LOCAL])),
    ).rejects.toMatchObject({ code: "migrate_generate_failed" });
  });

  test("propagates a non-zero exit from drizzle-kit", async () => {
    mockDrizzleKit().mockRejectedValue(
      Object.assign(new Error("drizzle-kit exited with code 1"), {
        code: "spawn_nonzero_exit",
      }),
    );

    await expect(
      migrateCommand.run(generateCtx([LOCAL])),
    ).rejects.toMatchObject({ code: "spawn_nonzero_exit" });
  });
});

describe("resolveDrizzleKitBin", () => {
  test("falls back to plumix's bundled drizzle-kit when cwd has none", () => {
    const empty = mkdtempSync(join(tmpdir(), "plumix-empty-"));
    try {
      const bin = migrateGenerateDeps.resolveDrizzleKitBin(empty);
      expect(bin).not.toBeNull();
      expect(bin).toMatch(/drizzle-kit\/bin\.cjs$/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("applying owner histories", () => {
  // A 1970 history, older than anything core ships.
  const WIDGETS_MIGRATIONS = join(
    import.meta.dirname,
    "../../../../core/src/test/fixtures/widgets/migrations",
  );

  // drizzle's own migrator over `node:sqlite`, through its `sqlite-proxy` driver
  // — the same shape every runtime hands the CLI.
  function sqliteDatabase(path: string): MigrationDatabase {
    const raw = new DatabaseSync(path);
    const inTransaction = (work: () => void): void => {
      raw.exec("BEGIN");
      try {
        work();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    };
    const db = drizzle((sql, params, method) => {
      const statement = raw.prepare(sql);
      if (method === "run") {
        statement.run(...(params as never[]));
        return Promise.resolve({ rows: [] });
      }
      statement.setReturnArrays(true);
      const rows = statement.all(
        ...(params as never[]),
      ) as unknown as unknown[][];
      // `get` is one row; the driver's type says an array either way.
      return Promise.resolve({
        rows: method === "get" ? (rows[0] ?? []) : rows,
      });
    });
    return {
      migrate: (folder) =>
        migrate(
          db,
          (queries) => {
            inTransaction(() => {
              for (const query of queries) raw.exec(query);
            });
            return Promise.resolve();
          },
          folder,
        ),
      all: (sql) => Promise.resolve(raw.prepare(sql).all()),
      batch: (statements) => {
        inTransaction(() => {
          for (const { sql, params } of statements) {
            raw.prepare(sql).run(...params);
          }
        });
        return Promise.resolve();
      },
      close: () => {
        raw.close();
        return Promise.resolve();
      },
    };
  }

  let dir: string;
  let opened: MigrationLocation[];

  function runtime(
    overrides: Partial<RuntimeMigrations> = {},
  ): RuntimeMigrations {
    return {
      remote: false,
      legacyTable: "__drizzle_migrations",
      open: ({ location }) => {
        opened.push(location);
        return Promise.resolve(
          sqliteDatabase(
            location === "memory" ? ":memory:" : join(dir, "site.sqlite"),
          ),
        );
      },
      ...overrides,
    };
  }

  // A package in the site's `node_modules` whose `./schema` a plugin names.
  function installPackage(name: string, migrations: string | null): void {
    const root = join(dir, "node_modules", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name, exports: { "./schema": "./schema.js" } }),
    );
    writeFileSync(join(root, "schema.js"), "export {};\n");
    if (migrations !== null)
      cpSync(migrations, join(root, "migrations"), { recursive: true });
  }

  const plugin = (id: string, schemaModule?: string) =>
    ({
      id,
      setup: () => undefined,
      schemaModule,
    }) as unknown as PlumixApp["config"]["plugins"][number];

  // A runtime package whose `plumix.e2e.wipe` names the local state, as each
  // shipped runtime's does.
  const RUNTIME_PACKAGE = "@acme/runtime";

  function installRuntime(wipe: readonly string[] | undefined): void {
    const root = join(dir, "node_modules", RUNTIME_PACKAGE);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: RUNTIME_PACKAGE,
        exports: { "./commands": "./commands.js" },
        plumix: wipe === undefined ? {} : { e2e: { wipe } },
      }),
    );
    writeFileSync(join(root, "commands.js"), "export {};\n");
  }

  function applyCtx(
    argv: readonly string[],
    plugins: PlumixApp["config"]["plugins"] = [],
    migrations: RuntimeMigrations = runtime(),
  ): CommandContext {
    return {
      app: {
        ...base,
        config: {
          ...base.config,
          plugins,
          runtime: {
            ...base.config.runtime,
            name: "acme",
            commandsModule: `${RUNTIME_PACKAGE}/commands`,
          },
        },
      },
      cwd: dir,
      configPath: join(dir, "plumix.config.ts"),
      argv,
      runtimeMigrations: migrations,
    };
  }

  function query(sql: string): Record<string, unknown>[] {
    const raw = new DatabaseSync(join(dir, "site.sqlite"));
    try {
      return raw.prepare(sql).all();
    } finally {
      raw.close();
    }
  }

  const names = (type: string): unknown[] =>
    query(
      `SELECT name FROM sqlite_master WHERE type = '${type}' ORDER BY name`,
    ).map((row) => row.name);

  const trackingRows = (table: string): number =>
    Number(query(`SELECT count(*) AS n FROM "${table}"`)[0]?.n);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-apply-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
    installRuntime(["site.sqlite", "uploads"]);
    opened = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("plumix migrate", () => {
    test("applies core's and each plugin package's history, one tracking table per owner, and a re-run applies nothing", async () => {
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);
      const plugins = [plugin("widgets", "@acme/plugin-widgets/schema")];

      await migrateCommand.run(applyCtx([], plugins));

      const tables = names("table");
      expect(tables).toContain("entries");
      expect(tables).toContain("widgets");
      expect(tables.filter((n) => String(n).startsWith("__drizzle"))).toEqual([
        "__drizzle_migrations_acme_plugin_widgets",
        "__drizzle_migrations_core",
      ]);
      expect(names("trigger")).toContain("entries_change_feed_insert");
      const applied = {
        core: trackingRows("__drizzle_migrations_core"),
        widgets: trackingRows("__drizzle_migrations_acme_plugin_widgets"),
      };
      expect(applied).toEqual({ core: 2, widgets: 1 });

      await migrateCommand.run(applyCtx([], plugins));

      expect({
        core: trackingRows("__drizzle_migrations_core"),
        widgets: trackingRows("__drizzle_migrations_acme_plugin_widgets"),
      }).toEqual(applied);
    });

    test("names each migration it applied, under its owner", async () => {
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateCommand.run(
        applyCtx([], [plugin("widgets", "@acme/plugin-widgets/schema")]),
      );

      expect(lines.join("\n")).toMatch(
        /^core: applied 2 migrations\n {2}applied \S+Z [0-9a-f]{8}\n {2}applied \S+Z [0-9a-f]{8}\n@acme\/plugin-widgets: applied 1 migration\n {2}applied 1970-01-01T00:00:01\.000Z [0-9a-f]{8}$/,
      );
    });

    test("applies a plugin package added after the first apply, though its migrations are older than core's", async () => {
      await migrateCommand.run(applyCtx([]));
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);

      await migrateCommand.run(
        applyCtx([], [plugin("widgets", "@acme/plugin-widgets/schema")]),
      );

      expect(names("table")).toContain("widgets");
    });

    test("refuses a package a plugin's schemaModule resolves into that ships no history, naming it", async () => {
      installPackage("@acme/plugin-bare", null);

      await expect(
        migrateCommand.run(
          applyCtx([], [plugin("bare", "@acme/plugin-bare/schema")]),
        ),
      ).rejects.toMatchObject({
        code: "migrate_owner_history_missing",
        message: expect.stringContaining("@acme/plugin-bare") as unknown,
      });
      expect(opened).toEqual([]);
    });

    test("applies the site's own migrations/ last when a schemaModule lands in the site", async () => {
      cpSync(WIDGETS_MIGRATIONS, join(dir, "migrations"), { recursive: true });
      installPackage("@acme/plugin-widgets", null);

      await migrateCommand.run(
        applyCtx([], [plugin("local", "./src/schema.ts")]),
      );

      expect(names("table")).toContain("widgets");
      expect(trackingRows("__drizzle_migrations_site")).toBe(1);
    });
  });

  describe("a config in its own package, named by --config", () => {
    test("treats the package holding the config as the site", async () => {
      const app = join(dir, "app");
      mkdirSync(app);
      writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app" }));
      cpSync(WIDGETS_MIGRATIONS, join(app, "migrations"), { recursive: true });

      await migrateCommand.run({
        ...applyCtx([], [plugin("local", "../app/src/schema.ts")]),
        configPath: join(app, "plumix.config.ts"),
      });

      expect(trackingRows("__drizzle_migrations_site")).toBe(1);
    });
  });

  describe("plumix migrate --remote", () => {
    test("opens the runtime's remote database", async () => {
      await migrateCommand.run(
        applyCtx(["--remote"], [], runtime({ remote: true })),
      );

      expect(opened).toEqual(["remote"]);
    });

    test("fails naming the runtime when it has no remote database", async () => {
      await expect(
        migrateCommand.run(applyCtx(["--remote"])),
      ).rejects.toMatchObject({
        code: "migrate_remote_unsupported",
        message: expect.stringContaining("acme runtime") as unknown,
      });
      expect(opened).toEqual([]);
    });
  });

  describe("plumix migrate fresh", () => {
    test("deletes the runtime's local state, then applies every owner", async () => {
      await migrateCommand.run(applyCtx([]));
      query("SELECT 1");
      new DatabaseSync(join(dir, "site.sqlite")).exec(
        "CREATE TABLE leftover (id integer)",
      );
      mkdirSync(join(dir, "uploads"));
      writeFileSync(join(dir, "uploads/a.png"), "x");
      mkdirSync(join(dir, "drizzle"));
      writeFileSync(join(dir, "drizzle/0000_site.sql"), "SELECT 1;");

      await migrateCommand.run(applyCtx(["fresh"]));

      expect(names("table")).not.toContain("leftover");
      expect(trackingRows("__drizzle_migrations_core")).toBe(2);
      expect(existsSync(join(dir, "uploads"))).toBe(false);
      expect(existsSync(join(dir, "drizzle/0000_site.sql"))).toBe(true);
    });

    test("refuses --remote without touching anything", async () => {
      await migrateCommand.run(applyCtx([]));
      opened = [];

      await expect(
        migrateCommand.run(
          applyCtx(["fresh", "--remote"], [], runtime({ remote: true })),
        ),
      ).rejects.toMatchObject({ code: "migrate_fresh_remote" });

      expect(opened).toEqual([]);
      expect(trackingRows("__drizzle_migrations_core")).toBe(2);
    });

    test("deletes nothing when a plugin package ships no history", async () => {
      await migrateCommand.run(applyCtx([]));
      installPackage("@acme/plugin-bare", null);

      await expect(
        migrateCommand.run(
          applyCtx(["fresh"], [plugin("bare", "@acme/plugin-bare/schema")]),
        ),
      ).rejects.toMatchObject({ code: "migrate_owner_history_missing" });

      expect(trackingRows("__drizzle_migrations_core")).toBe(2);
    });

    test("fails when the runtime declares no local state to delete", async () => {
      installRuntime(undefined);

      await expect(
        migrateCommand.run(applyCtx(["fresh"])),
      ).rejects.toMatchObject({
        code: "migrate_fresh_no_wipe",
      });
    });
  });

  describe("plumix migrate status", () => {
    test("lists each owner in order with its applied and pending migrations", async () => {
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);
      const plugins = [plugin("widgets", "@acme/plugin-widgets/schema")];
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));

      await migrateCommand.run(applyCtx(["status"], plugins));

      expect(lines.join("\n")).toMatch(
        /^core: 0 applied, 2 pending\n {2}pending .+\n {2}pending .+\n@acme\/plugin-widgets: 0 applied, 1 pending\n {2}pending 1970-01-01T00:00:01\.000Z [0-9a-f]{8}$/,
      );
    });
  });

  describe("adopting a database built from a legacy site history", () => {
    // A legacy database: the same tables, recorded in drizzle's default
    // tracking table.
    async function buildLegacy(): Promise<void> {
      const db = sqliteDatabase(join(dir, "site.sqlite"));
      await db.migrate({
        migrationsFolder: CORE_MIGRATIONS_FOLDER,
        migrationsTable: "__drizzle_migrations",
      });
      await db.close();
    }

    const schema = () =>
      query(
        "SELECT type, name, sql FROM sqlite_master WHERE tbl_name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\' ORDER BY name",
      );

    test("records every owner migration as applied without running DDL, and the next run applies nothing", async () => {
      await buildLegacy();
      const before = schema();
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateCommand.run(applyCtx([]));

      expect(schema()).toEqual(before);
      expect(trackingRows("__drizzle_migrations_core")).toBe(2);
      expect(opened).toEqual(["local", "memory"]);
      expect(lines.join("\n")).toContain("drizzle/");

      lines.length = 0;
      await migrateCommand.run(applyCtx([]));
      expect(lines).toEqual(["core: up to date"]);
    });

    test("refuses a schema that differs, naming the difference, and changes nothing", async () => {
      await buildLegacy();
      new DatabaseSync(join(dir, "site.sqlite")).exec(
        "ALTER TABLE users ADD COLUMN nickname text",
      );
      const before = query("SELECT name, sql FROM sqlite_master ORDER BY name");

      await expect(migrateCommand.run(applyCtx([]))).rejects.toMatchObject({
        code: "migrate_adoption_mismatch",
        message: expect.stringMatching(/users.*nickname/) as unknown,
      });

      expect(
        query("SELECT name, sql FROM sqlite_master ORDER BY name"),
      ).toEqual(before);
    });

    test("advises generating when a table the site's own schema declares has no migration in its history", async () => {
      await buildLegacy();
      new DatabaseSync(join(dir, "site.sqlite")).exec(
        "CREATE TABLE bookmarks (id integer PRIMARY KEY)",
      );
      const local = {
        id: "local",
        setup: () => undefined,
        schemaModule: "../src/schema.ts",
        schema: {
          bookmarks: sqliteTable("bookmarks", (t) => ({
            id: t.integer().primaryKey(),
          })),
        },
      } as unknown as PlumixApp["config"]["plugins"][number];

      await expect(
        migrateCommand.run(applyCtx([], [local])),
      ).rejects.toMatchObject({
        code: "migrate_adoption_mismatch",
        hint: expect.stringMatching(
          /bookmarks.*`plumix migrate generate`/,
        ) as unknown,
      });
    });
  });
});
