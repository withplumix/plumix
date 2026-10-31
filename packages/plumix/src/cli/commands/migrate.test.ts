import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

import { buildDataMigrations } from "../../vite/data-migrations-bundle.js";
import { applyBuiltMigrations, copyOwnerHistories } from "../migrate/built.js";
import { report } from "../report.js";
import {
  migrateBeforeDeploy,
  migrateCommand,
  migrateForDev,
  migrateGenerateDeps,
} from "./migrate.js";
import { syncDeps } from "./sync.js";

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
  function sqliteDatabase(
    path: string,
    {
      remote = false,
      summary = "local · site.sqlite",
      name = "site.sqlite",
    } = {},
  ): MigrationDatabase {
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
      drizzle: db,
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
      // A test's stand-in for each runtime's own: every table but SQLite's.
      wipe: () => {
        raw.exec("PRAGMA foreign_keys = OFF");
        inTransaction(() => {
          const tables = raw
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*'",
            )
            .all();
          for (const { name } of tables) {
            raw.exec(`DROP TABLE IF EXISTS "${String(name)}"`);
          }
        });
        raw.exec("PRAGMA foreign_keys = ON");
        return Promise.resolve();
      },
      close: () => {
        raw.close();
        return Promise.resolve();
      },
      target: { remote, summary, notes: [], name },
    };
  }

  let dir: string;
  let opened: MigrationLocation[];

  const PRODUCTION = {
    targetOptions: {
      production: {
        type: "boolean",
        description: "Migrate the production database",
      },
    },
  } as const;

  function runtime(
    overrides: Partial<RuntimeMigrations> = {},
  ): RuntimeMigrations {
    return {
      legacyTable: "__drizzle_migrations",
      open: ({ location, targetValues }) => {
        opened.push(location);
        const remote = targetValues.production === true;
        return Promise.resolve(
          sqliteDatabase(
            location === "memory" ? ":memory:" : join(dir, "site.sqlite"),
            remote ? { remote, summary: "production · site.sqlite" } : {},
          ),
        );
      },
      openRun: () => Promise.reject(new Error("migrate never runs the site")),
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

  // drizzle-kit generate as it behaves: writes `next` into the history in
  // `--out`, and nothing once it has every file.
  function drizzleKitWrites(next: Record<string, string>) {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    return vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockImplementation((_command, args, options) => {
        const out = resolve(options.cwd, args[args.indexOf("--out") + 1] ?? "");
        const files = Object.entries(next);
        if (files.every(([file]) => existsSync(join(out, file)))) {
          return Promise.resolve("");
        }
        for (const [file, content] of files) {
          mkdirSync(join(out, file, ".."), { recursive: true });
          writeFileSync(join(out, file), content);
        }
        return Promise.resolve("");
      });
  }

  const LOCAL = plugin("local", "./src/schema.ts");

  // A package whose `./data-migrations` default-exports `source`'s list. The
  // SQL is a string, so the module imports nothing.
  function installDataMigrations(name: string, source: string): void {
    const root = join(dir, "node_modules", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name,
        type: "module",
        exports: { "./data-migrations": "./data-migrations.js" },
      }),
    );
    writeFileSync(join(root, "data-migrations.js"), source);
  }

  const dataPlugin = (id: string, dataMigrations: string) =>
    ({
      id,
      setup: () => undefined,
      dataMigrations,
    }) as unknown as PlumixApp["config"]["plugins"][number];

  // A module whose migrations each append their name to `runs`.
  const recording = (...names: string[]) =>
    `export default ${JSON.stringify(names)}.map((name) => ({
name,
async up({ db }) {
  await db.run("CREATE TABLE IF NOT EXISTS runs (n integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL)");
  await db.run(\`INSERT INTO runs (name) VALUES ('\${name}')\`);
},
}));
`;

  function insertSetting(group: string, key: string, value: string): void {
    const raw = new DatabaseSync(join(dir, "site.sqlite"));
    try {
      raw
        .prepare(`INSERT INTO settings ("group", key, value) VALUES (?, ?, ?)`)
        .run(group, key, value);
    } finally {
      raw.close();
    }
  }

  function siteWithHistory(): void {
    cpSync(WIDGETS_MIGRATIONS, join(dir, "migrations"), { recursive: true });
    installPackage("@acme/plugin-widgets", null);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-apply-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
    opened = [];
    drizzleKitWrites({});
    // What each owner applied is the command's own output; a test that reads
    // it collects the lines through these.
    vi.spyOn(report, "info").mockImplementation(() => undefined);
    vi.spyOn(report, "success").mockImplementation(() => undefined);
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
      expect(applied).toEqual({ core: 5, widgets: 1 });

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
        /^→ local · site\.sqlite\ncore: applied 5 migrations\n {2}applied \S+Z [0-9a-f]{8}\n {2}applied \S+Z [0-9a-f]{8}\n {2}applied \S+Z [0-9a-f]{8}\n {2}applied \S+Z [0-9a-f]{8}\n {2}applied \S+Z [0-9a-f]{8}\n@acme\/plugin-widgets: applied 1 migration\n {2}applied 1970-01-01T00:00:01\.000Z [0-9a-f]{8}$/,
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

  describe("data migrations", () => {
    // Renames `flags.beta_enabled` to `flags.beta`, counting its runs in
    // `flags.runs`.
    const RENAME_BETA = `export default [{
  name: "rename-beta",
  async up({ db }) {
    await db.run("UPDATE settings SET key = 'beta' WHERE \\"group\\" = 'flags' AND key = 'beta_enabled'");
    await db.run("INSERT INTO settings (\\"group\\", key, value) VALUES ('flags', 'runs', '1') ON CONFLICT DO UPDATE SET value = value + 1");
  },
}];
`;

    // A migrated database holding `flags.beta_enabled`, and the plugin whose
    // data migration renames it.
    async function siteWithBetaFlag() {
      await migrateCommand.run(applyCtx([]));
      insertSetting("flags", "beta_enabled", "true");
      installDataMigrations("@acme/plugin-flags", RENAME_BETA);
      return [dataPlugin("flags", "@acme/plugin-flags/data-migrations")];
    }

    test("a plugin with no tables renames a settings key", async () => {
      const plugins = await siteWithBetaFlag();
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateCommand.run(applyCtx([], plugins));

      expect(
        query(`SELECT key, value FROM settings WHERE "group" = 'flags'`),
      ).toEqual([
        { key: "beta", value: "true" },
        { key: "runs", value: "1" },
      ]);
      expect(lines.slice(-2)).toEqual([
        "@acme/plugin-flags: applied 1 data migration",
        "  applied rename-beta",
      ]);
    });

    test("a second run reports a data migration up to date without running it", async () => {
      const plugins = await siteWithBetaFlag();
      await migrateCommand.run(applyCtx([], plugins));
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));

      await migrateCommand.run(applyCtx([], plugins));

      expect(lines.at(-1)).toBe(
        "@acme/plugin-flags: data migrations up to date",
      );
      expect(query(`SELECT value FROM settings WHERE key = 'runs'`)).toEqual([
        { value: "1" },
      ]);
    });

    test("every owner's schema migrations finish before any data migration starts", async () => {
      installDataMigrations(
        "@acme/plugin-seed",
        `export default [{
  name: "seed-widget",
  async up({ db }) {
    await db.run("INSERT INTO widgets (id, name) VALUES (1, 'seeded')");
  },
}];
`,
      );
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);
      // The seeding plugin comes first, so its data migration would run before
      // the widgets history if owners ran schema and data in turn.
      const plugins = [
        dataPlugin("seed", "@acme/plugin-seed/data-migrations"),
        plugin("widgets", "@acme/plugin-widgets/schema"),
      ];

      await migrateCommand.run(applyCtx([], plugins));

      expect(query("SELECT name FROM widgets")).toEqual([{ name: "seeded" }]);
    });
    test("run in the order: each plugin package in config order, then the site, each list in array order", async () => {
      installDataMigrations("@acme/plugin-b", recording("b1", "b2"));
      installDataMigrations("@acme/plugin-a", recording("a1"));
      // A plugin module inside the site's package is the site's.
      writeFileSync(join(dir, "local-data.mjs"), recording("local1"));
      writeFileSync(join(dir, "site-data.mjs"), recording("site1", "site2"));
      const ctx = applyCtx(
        [],
        [
          dataPlugin("b", "@acme/plugin-b/data-migrations"),
          dataPlugin("local", "../local-data.mjs"),
          dataPlugin("a", "@acme/plugin-a/data-migrations"),
        ],
      );
      const lines: string[] = [];
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateCommand.run({
        ...ctx,
        app: {
          ...ctx.app,
          config: { ...ctx.app.config, dataMigrations: "./site-data.mjs" },
        },
      });

      expect(query("SELECT name FROM runs ORDER BY n")).toEqual(
        ["b1", "b2", "a1", "local1", "site1", "site2"].map((name) => ({
          name,
        })),
      );
      expect(lines.filter((line) => line.includes("data migration"))).toEqual([
        "@acme/plugin-b: applied 2 data migrations",
        "@acme/plugin-a: applied 1 data migration",
        "site: applied 3 data migrations",
      ]);
    });

    test("a site reached through a symlink still runs the plugin modules inside it after every plugin package", async () => {
      // A path through a symlink: macOS's `/var`, a linked projects folder.
      const real = dir;
      dir = `${real}-link`;
      symlinkSync(real, dir, "dir");
      try {
        installDataMigrations("@acme/plugin-a", recording("a1"));
        writeFileSync(join(dir, "local-data.mjs"), recording("local1"));

        await migrateCommand.run(
          applyCtx(
            [],
            [
              dataPlugin("local", "../local-data.mjs"),
              dataPlugin("a", "@acme/plugin-a/data-migrations"),
            ],
          ),
        );

        expect(query("SELECT name FROM runs ORDER BY n")).toEqual([
          { name: "a1" },
          { name: "local1" },
        ]);
      } finally {
        rmSync(dir);
        dir = real;
      }
    });
    // `broken` throws until the `fixed` setting exists; `first` and `after`
    // are its neighbours in the plugin's list, `site1` is the site's.
    function siteWithBrokenMigration() {
      const failing = `export default [
  { name: "first", async up({ db }) {
    await db.run("CREATE TABLE IF NOT EXISTS runs (n integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL)");
    await db.run("INSERT INTO runs (name) VALUES ('first')");
  } },
  { name: "broken", async up({ db }) {
    const fixed = await db.all("SELECT 1 FROM settings WHERE key = 'fixed'");
    if (fixed.length === 0) throw new Error("the flag is gone");
  } },
  { name: "after", async up({ db }) { await db.run("INSERT INTO runs (name) VALUES ('after')"); } },
];
`;
      installDataMigrations("@acme/plugin-flags", failing);
      writeFileSync(join(dir, "site-data.mjs"), recording("site1"));
      const ctx = applyCtx(
        [],
        [dataPlugin("flags", "@acme/plugin-flags/data-migrations")],
      );
      return async () => {
        await migrateCommand.run({
          ...ctx,
          app: {
            ...ctx.app,
            config: { ...ctx.app.config, dataMigrations: "./site-data.mjs" },
          },
        });
      };
    }

    test("a throwing up fails naming its owner and name", async () => {
      const run = siteWithBrokenMigration();

      await expect(run()).rejects.toMatchObject({
        code: "migrate_data_failed",
        message: expect.stringMatching(
          /@acme\/plugin-flags.+"broken".+the flag is gone/,
        ) as unknown,
      });
    });

    test("a throwing up is not recorded and nothing after it runs", async () => {
      const run = siteWithBrokenMigration();

      await run().catch(() => undefined);

      expect(query("SELECT name FROM runs ORDER BY n")).toEqual([
        { name: "first" },
      ]);
      expect(query(`SELECT owner, name FROM __plumix_data_migrations`)).toEqual(
        [{ owner: "@acme/plugin-flags", name: "first" }],
      );
    });

    test("the next run applies a failed data migration once its cause is fixed", async () => {
      const run = siteWithBrokenMigration();
      await run().catch(() => undefined);
      insertSetting("flags", "fixed", "true");

      await run();

      expect(query("SELECT name FROM runs ORDER BY n")).toEqual(
        ["first", "after", "site1"].map((name) => ({ name })),
      );
      expect(
        query(
          `SELECT owner, name FROM __plumix_data_migrations ORDER BY owner, name`,
        ),
      ).toEqual([
        { owner: "@acme/plugin-flags", name: "after" },
        { owner: "@acme/plugin-flags", name: "broken" },
        { owner: "@acme/plugin-flags", name: "first" },
        { owner: "site", name: "site1" },
      ]);
    });

    test("a duplicate name within one owner fails before any data migration runs", async () => {
      installDataMigrations("@acme/plugin-a", recording("a1"));
      writeFileSync(
        join(dir, "site-data.mjs"),
        recording("site1", "site2", "site1"),
      );
      const ctx = applyCtx(
        [],
        [dataPlugin("a", "@acme/plugin-a/data-migrations")],
      );

      await expect(
        migrateCommand.run({
          ...ctx,
          app: {
            ...ctx.app,
            config: { ...ctx.app.config, dataMigrations: "./site-data.mjs" },
          },
        }),
      ).rejects.toMatchObject({
        code: "migrate_data_duplicate_name",
        message: expect.stringMatching(/^site .+"site1"/) as unknown,
      });
      expect(names("table")).not.toContain("runs");
    });
  });

  describe("a site whose own tables are ahead of its history", () => {
    const NEXT = {
      "0001_nickname.sql": "ALTER TABLE `widgets` ADD `nickname` text;",
    };

    test("plumix migrate fails naming the fix, and opens and writes nothing", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT);

      await expect(
        migrateCommand.run(applyCtx([], [LOCAL])),
      ).rejects.toMatchObject({
        code: "migrate_site_drifted",
        hint: expect.stringContaining("plumix migrate generate") as unknown,
      });

      expect(opened).toEqual([]);
      expect(readdirSync(join(dir, "migrations")).sort()).toEqual([
        "0000_widgets.sql",
        "meta",
      ]);
    });

    test("plumix migrate writes no schema module for the check", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT);

      await expect(
        migrateCommand.run(applyCtx([], [LOCAL])),
      ).rejects.toMatchObject({ code: "migrate_site_drifted" });

      expect(existsSync(join(dir, ".plumix"))).toBe(false);
    });

    test("plumix migrate leaves a schema module generate wrote as it was", async () => {
      siteWithHistory();
      mkdirSync(join(dir, ".plumix"));
      writeFileSync(join(dir, ".plumix/site-schema.ts"), "// earlier\n");
      drizzleKitWrites(NEXT);

      await expect(
        migrateCommand.run(applyCtx([], [LOCAL])),
      ).rejects.toMatchObject({ code: "migrate_site_drifted" });

      expect(readFileSync(join(dir, ".plumix/site-schema.ts"), "utf8")).toBe(
        "// earlier\n",
      );
    });

    test("plumix migrate fresh fails before it drops anything", async () => {
      siteWithHistory();
      writeFileSync(join(dir, "site.sqlite"), "");
      drizzleKitWrites(NEXT);

      await expect(
        migrateCommand.run(applyCtx(["fresh"], [LOCAL])),
      ).rejects.toMatchObject({ code: "migrate_site_drifted" });

      expect(existsSync(join(dir, "site.sqlite"))).toBe(true);
      expect(opened).toEqual([]);
    });

    test("a site whose history is up to date applies it", async () => {
      siteWithHistory();
      drizzleKitWrites({ "0000_widgets.sql": "" });

      await migrateCommand.run(applyCtx([], [LOCAL]));

      expect(trackingRows("__drizzle_migrations_site")).toBe(1);
    });
  });

  describe("the histories a build ships beside the server", () => {
    const WIDGETS = [plugin("widgets", "@acme/plugin-widgets/schema")];

    function installPlumixStub(): void {
      const root = join(dir, "node_modules/plumix");
      mkdirSync(root, { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "plumix",
          type: "module",
          exports: { "./db": "./stub.js", "./schema": "./stub.js" },
        }),
      );
      writeFileSync(join(root, "stub.js"), "export {};\n");
    }

    async function build(
      config: Partial<PlumixApp["config"]> = {},
    ): Promise<string> {
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);
      const { cwd, configPath, app } = applyCtx([], WIDGETS);
      const site = { cwd, configPath, config: { ...app.config, ...config } };
      const serverDir = join(dir, "dist/server");
      copyOwnerHistories(site, serverDir);
      // External, like a site's `build.external`: the unit tier has no
      // `dist/` to bundle `plumix` from, so the import resolves to source at
      // load; the stub lets the build resolve it.
      installPlumixStub();
      await buildDataMigrations(site, {
        entry: ".plumix/worker.ts",
        outDir: "dist/server",
        external: ["plumix/db", "plumix/schema"],
      });
      // The server runs from what the build wrote, not the installed packages.
      rmSync(join(dir, "node_modules/@acme/plugin-widgets"), {
        recursive: true,
      });
      return serverDir;
    }

    const serve = (serverDir: string) =>
      applyBuiltMigrations({
        serverDir,
        cwd: dir,
        config: applyCtx([], WIDGETS).app.config,
        migrations: runtime(),
      });

    // The site's data migration renames a settings key with the query
    // builder on core's `settings` table and with `sql`.
    const RENAME = `import { eq, sql } from "plumix/db";
import { settings } from "plumix/schema";

export default [
  {
    name: "rename-beta",
    async up({ db }) {
      await db.insert(settings).values({ group: "flags", key: "beta_enabled", value: true });
      await db.update(settings).set({ key: "beta" }).where(eq(settings.key, "beta_enabled"));
      await db.run(sql\`UPDATE settings SET value = json('false') WHERE key = \${"beta"}\`);
    },
  },
];
`;

    async function buildRename(): Promise<string> {
      writeFileSync(join(dir, "site-data.ts"), RENAME);
      return build({ dataMigrations: "./site-data.ts" });
    }

    test("the server applies every owner's schema, then the bundle's data migrations", async () => {
      const serverDir = await buildRename();
      const lines: string[] = [];
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await serve(serverDir);

      expect(
        query(`SELECT key, value FROM settings WHERE "group" = 'flags'`),
      ).toEqual([{ key: "beta", value: "false" }]);
      expect(lines).toEqual([
        "core: applied 5 migrations",
        "@acme/plugin-widgets: applied 1 migration",
        "site: applied 1 data migration",
      ]);
    });

    test("a second start of the server reports the bundle's data migrations up to date and runs nothing", async () => {
      const serverDir = await buildRename();
      await serve(serverDir);
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));

      await serve(serverDir);

      expect(lines).toEqual([
        "core: up to date",
        "@acme/plugin-widgets: up to date",
        "site: data migrations up to date",
      ]);
      expect(query(`SELECT owner, name FROM __plumix_data_migrations`)).toEqual(
        [{ owner: "site", name: "rename-beta" }],
      );
    });

    test("lays each owner's history out under migrations/<owner>/", async () => {
      const serverDir = await build();

      expect(readdirSync(join(serverDir, "migrations")).sort()).toEqual([
        "acme_plugin_widgets",
        "core",
        "data-migrations.js",
        "owners.json",
      ]);
    });

    test("the server applies every owner's history in order, each in its own tracking table", async () => {
      const serverDir = await build();
      const lines: string[] = [];
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await serve(serverDir);

      expect(names("table")).toContain("widgets");
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
      expect(trackingRows("__drizzle_migrations_acme_plugin_widgets")).toBe(1);
      expect(lines).toEqual([
        "core: applied 5 migrations",
        "@acme/plugin-widgets: applied 1 migration",
      ]);
    });

    test("against an up-to-date database the server applies nothing", async () => {
      const serverDir = await build();
      await serve(serverDir);
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));

      await serve(serverDir);

      expect(lines).toEqual([
        "core: up to date",
        "@acme/plugin-widgets: up to date",
      ]);
    });
  });

  describe("migrating before a deploy", () => {
    test("applies every owner to the database the target names, unprompted", async () => {
      const confirm = vi.spyOn(syncDeps, "confirm");

      await migrateBeforeDeploy(applyCtx([], [], runtime(PRODUCTION)), {
        production: true,
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("fails on a site whose own tables are ahead of its history, opening nothing", async () => {
      siteWithHistory();
      drizzleKitWrites({ "0001_nickname.sql": "" });

      await expect(
        migrateBeforeDeploy(applyCtx([], [LOCAL], runtime(PRODUCTION)), {
          production: true,
        }),
      ).rejects.toMatchObject({ code: "migrate_site_drifted" });

      expect(opened).toEqual([]);
    });
  });

  describe("migrating before plumix dev", () => {
    const NEXT = {
      "0001_nickname.sql": "ALTER TABLE `widgets` ADD `nickname` text;",
      // What drizzle-kit writes beside every migration.
      "meta/0001_snapshot.json": "{}",
      "meta/_journal.json": JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          {
            idx: 0,
            version: "6",
            when: 1000,
            tag: "0000_widgets",
            breakpoints: true,
          },
          {
            idx: 1,
            version: "6",
            when: 2000,
            tag: "0001_nickname",
            breakpoints: true,
          },
        ],
      }),
    };

    function devTarget(plugins: PlumixApp["config"]["plugins"]) {
      const { cwd, configPath, app, runtimeMigrations } = applyCtx([], plugins);
      return { cwd, configPath, config: app.config, runtimeMigrations };
    }

    const columns = (table: string): unknown[] =>
      query(`SELECT name FROM pragma_table_info('${table}')`).map(
        (row) => row.name,
      );

    test("writes the site's next migration, applies it, and says to commit it", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT);
      const lines: string[] = [];
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateForDev(devTarget([LOCAL]));

      expect(readdirSync(join(dir, "migrations")).sort()).toEqual([
        "0000_widgets.sql",
        "0001_nickname.sql",
        "meta",
      ]);
      expect(columns("widgets")).toContain("nickname");
      expect(lines).toContain(
        "Wrote the site's next migration, migrations/0001_nickname.sql: commit it.",
      );
    });

    test("applies the site's pending data migrations after the migration it wrote, which they can read", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT);
      writeFileSync(
        join(dir, "site-data.mjs"),
        `export default [{
  name: "nickname-widgets",
  async up({ db }) {
    await db.run("INSERT INTO widgets (id, name, nickname) VALUES (1, 'w', 'nick')");
  },
}];
`,
      );
      const target = devTarget([LOCAL]);

      await migrateForDev({
        ...target,
        config: { ...target.config, dataMigrations: "./site-data.mjs" },
      });

      expect(query("SELECT nickname FROM widgets")).toEqual([
        { nickname: "nick" },
      ]);
      expect(query("SELECT owner, name FROM __plumix_data_migrations")).toEqual(
        [{ owner: "site", name: "nickname-widgets" }],
      );
    });

    test("a second start writes nothing", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT);
      await migrateForDev(devTarget([LOCAL]));
      const lines: string[] = [];
      vi.spyOn(report, "success").mockImplementation((line) =>
        lines.push(line),
      );

      await migrateForDev(devTarget([LOCAL]));

      expect(lines).toEqual([]);
      expect(trackingRows("__drizzle_migrations_site")).toBe(2);
    });

    test("applies the tables of a plugin package added to the config", async () => {
      await migrateForDev(devTarget([]));
      installPackage("@acme/plugin-widgets", WIDGETS_MIGRATIONS);

      await migrateForDev(
        devTarget([plugin("widgets", "@acme/plugin-widgets/schema")]),
      );

      expect(names("table")).toContain("widgets");
    });

    test("stops with the interactive-generate advice when drizzle-kit needs a rename answered", async () => {
      siteWithHistory();
      drizzleKitWrites({}).mockResolvedValue(
        "Error: Interactive prompts require a TTY terminal\n",
      );

      await expect(migrateForDev(devTarget([LOCAL]))).rejects.toMatchObject({
        code: "migrate_generate_failed",
        hint: expect.stringContaining("interactive terminal") as unknown,
      });
      expect(opened).toEqual([]);
    });

    test("leaves migrations/ untouched when drizzle-kit fails after writing", async () => {
      siteWithHistory();
      drizzleKitWrites(NEXT).mockImplementation((_command, args, options) => {
        const out = resolve(options.cwd, args[args.indexOf("--out") + 1] ?? "");
        writeFileSync(join(out, "0001_half.sql"), "ALTER TABLE");
        return Promise.resolve("Error: Interactive prompts require a TTY\n");
      });

      await expect(migrateForDev(devTarget([LOCAL]))).rejects.toMatchObject({
        code: "migrate_generate_failed",
      });

      expect(readdirSync(join(dir, "migrations")).sort()).toEqual([
        "0000_widgets.sql",
        "meta",
      ]);
    });

    test("adopts a database built from a legacy site history", async () => {
      const legacy = sqliteDatabase(join(dir, "site.sqlite"));
      await legacy.migrate({
        migrationsFolder: CORE_MIGRATIONS_FOLDER,
        migrationsTable: "__drizzle_migrations",
      });
      await legacy.close();

      await migrateForDev(devTarget([]));

      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
      expect(opened).toEqual(["site", "memory"]);
    });

    test("starts on a runtime that cannot open its database, migrating nothing", async () => {
      await migrateForDev({ ...devTarget([]), runtimeMigrations: undefined });

      expect(existsSync(join(dir, "site.sqlite"))).toBe(false);
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

  describe("a runtime's target options", () => {
    test("migrate parses the options the runtime declares and hands them to open", async () => {
      const targets: unknown[] = [];
      const migrations = runtime(PRODUCTION);

      await migrateCommand.run(
        applyCtx(["--production", "--yes"], [], {
          ...migrations,
          open: (options) => {
            targets.push(options.targetValues);
            return migrations.open(options);
          },
        }),
      );

      expect(targets).toEqual([{ production: true }]);
    });

    test("an option the runtime does not declare fails naming the runtime", async () => {
      await expect(
        migrateCommand.run(applyCtx(["--production"])),
      ).rejects.toMatchObject({
        code: "unknown_option",
        message: expect.stringContaining("acme runtime") as unknown,
      });
      expect(opened).toEqual([]);
    });
  });

  describe("a migrate that writes to a deployed database", () => {
    function production(argv: readonly string[]): CommandContext {
      return applyCtx(["--production", ...argv], [], runtime(PRODUCTION));
    }

    function interactive(answer: boolean) {
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      return vi.spyOn(syncDeps, "confirm").mockResolvedValue(answer);
    }

    test("prints the target and each owner's pending migrations before it asks", async () => {
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      const confirm = interactive(false);

      await migrateCommand.run(production([]));

      expect(lines.slice(0, 4)).toEqual([
        "→ production · site.sqlite",
        "core: 5 pending",
        expect.stringMatching(/^ {2}pending \S+Z [0-9a-f]{8}$/) as unknown,
        expect.stringMatching(/^ {2}pending \S+Z [0-9a-f]{8}$/) as unknown,
      ]);
      expect(confirm).toHaveBeenCalledWith(
        "Apply these migrations to production · site.sqlite?",
      );
    });

    test("a declined prompt applies nothing", async () => {
      interactive(false);

      await migrateCommand.run(production([]));

      expect(names("table")).not.toContain("__drizzle_migrations_core");
    });

    test("an accepted prompt applies every owner", async () => {
      interactive(true);

      await migrateCommand.run(production([]));

      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("--yes applies without asking", async () => {
      const confirm = interactive(false);

      await migrateCommand.run(production(["--yes"]));

      expect(confirm).not.toHaveBeenCalled();
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("--dry-run prints the plan and applies nothing", async () => {
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      const confirm = interactive(true);

      await migrateCommand.run(production(["--dry-run"]));

      expect(confirm).not.toHaveBeenCalled();
      expect(lines.at(-1)).toBe("Dry run: nothing was changed.");
      expect(names("table")).not.toContain("__drizzle_migrations_core");
    });

    test("without a terminal or --yes it refuses, applying nothing", async () => {
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);

      await expect(migrateCommand.run(production([]))).rejects.toMatchObject({
        code: "migrate_unconfirmed",
      });

      expect(names("table")).not.toContain("__drizzle_migrations_core");
    });

    test("a local migrate never asks", async () => {
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);
      const confirm = vi.spyOn(syncDeps, "confirm");

      await migrateCommand.run(applyCtx([], [], runtime(PRODUCTION)));

      expect(confirm).not.toHaveBeenCalled();
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });
  });

  describe("plumix migrate fresh", () => {
    // A runtime whose target options each name a deployed database, as
    // Cloudflare's do; `events` records the wipe and the restore point.
    function deployed(events: string[] = []): RuntimeMigrations {
      return runtime({
        targetOptions: {
          production: { type: "boolean", description: "Production" },
          preview: { type: "boolean", description: "Previews" },
          env: { type: "string", description: "An environment" },
        },
        open: ({ location }) => {
          opened.push(location);
          const db = sqliteDatabase(join(dir, "site.sqlite"), {
            remote: true,
            summary: "preview · DB · site-preview",
            name: "site-preview",
          });
          return Promise.resolve({
            ...db,
            wipe: () => {
              events.push("wipe");
              return db.wipe();
            },
            restorePoint: () => {
              events.push("restore point");
              return Promise.resolve("Restore point: bookmark b-1");
            },
          });
        },
      });
    }

    test.each([[["--production"]], [["--env", "production"]]])(
      "refuses %j before it connects",
      async (argv) => {
        await expect(
          migrateCommand.run(
            applyCtx(["fresh", ...argv, "--yes"], [], deployed()),
          ),
        ).rejects.toMatchObject({ code: "migrate_fresh_production" });

        expect(opened).toEqual([]);
      },
    );

    test.each([
      [["--production", "fresh"]],
      [["--env", "production", "fresh"]],
      [["--binding", "DB", "--production", "fresh"]],
    ])("refuses %j wherever `fresh` sits, before it connects", async (argv) => {
      await expect(
        migrateCommand.run(applyCtx([...argv, "--yes"], [], deployed())),
      ).rejects.toMatchObject({ code: "migrate_fresh_production" });

      expect(opened).toEqual([]);
    });

    // Node and Bun declare no target options, so the refusal comes before
    // the parser that would reject the flag as unknown.
    test.each([
      [["--production"]],
      [["--env", "production"]],
      [["--env=production"]],
    ])(
      "refuses %j on a runtime with no target options, before it connects",
      async (argv) => {
        await expect(
          migrateCommand.run(applyCtx(["fresh", ...argv])),
        ).rejects.toMatchObject({
          code: "migrate_fresh_production",
          message: "plumix migrate fresh never runs against production",
        });

        expect(opened).toEqual([]);
      },
    );

    test("drops every table, then applies every owner's schema and data migrations", async () => {
      writeFileSync(join(dir, "data.mjs"), recording("a1"));
      const withData = (argv: readonly string[]): CommandContext => {
        const ctx = applyCtx(argv);
        return {
          ...ctx,
          app: {
            ...ctx.app,
            config: { ...ctx.app.config, dataMigrations: "./data.mjs" },
          },
        };
      };
      await migrateCommand.run(withData([]));
      const raw = new DatabaseSync(join(dir, "site.sqlite"));
      raw.exec("CREATE TABLE leftover (id integer)");
      raw.close();

      await migrateCommand.run(withData(["fresh", "--yes"]));

      expect(names("table")).not.toContain("leftover");
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
      expect(query("SELECT name FROM runs")).toEqual([{ name: "a1" }]);
    });

    test("without a terminal or --yes it refuses, dropping nothing", async () => {
      await migrateCommand.run(applyCtx([]));
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);

      await expect(
        migrateCommand.run(applyCtx(["fresh"])),
      ).rejects.toMatchObject({ code: "migrate_fresh_unconfirmed" });

      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("lists every table it drops and asks before dropping any", async () => {
      await migrateCommand.run(applyCtx([]));
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      const confirm = vi.spyOn(syncDeps, "confirm").mockResolvedValue(false);

      await migrateCommand.run(applyCtx(["fresh"]));

      expect(lines).toContainEqual(
        expect.stringMatching(/^Drops \d+ tables:$/),
      );
      expect(lines).toContain("  __drizzle_migrations_core");
      expect(lines).toContain("  users");
      expect(confirm).toHaveBeenCalledWith(
        "Drop every table in local · site.sqlite and migrate it from nothing?",
      );
      expect(lines.at(-1)).toBe("Nothing was dropped.");
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("--dry-run prints the plan and drops nothing", async () => {
      await migrateCommand.run(applyCtx([]));
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));
      const confirm = vi.spyOn(syncDeps, "confirm");

      await migrateCommand.run(applyCtx(["fresh", "--dry-run"]));

      expect(confirm).not.toHaveBeenCalled();
      expect(lines).toContain("core: 5 to apply");
      expect(lines.at(-1)).toBe("Dry run: nothing was dropped.");
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("a remote wipe asks for the database's name, and a wrong one aborts", async () => {
      await migrateCommand.run(applyCtx([]));
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      const confirm = vi.spyOn(syncDeps, "confirm");
      const ask = vi.spyOn(syncDeps, "ask").mockResolvedValue("site-prod");
      const events: string[] = [];

      await expect(
        migrateCommand.run(
          applyCtx(["fresh", "--preview"], [], deployed(events)),
        ),
      ).rejects.toMatchObject({ code: "migrate_fresh_name_mismatch" });

      expect(ask).toHaveBeenCalledWith(
        "Type site-preview to drop every table in preview · DB · site-preview:",
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(events).toEqual([]);
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("a remote wipe goes ahead once the database's name is typed", async () => {
      await migrateCommand.run(applyCtx([]));
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      vi.spyOn(syncDeps, "ask").mockResolvedValue(" site-preview ");
      const raw = new DatabaseSync(join(dir, "site.sqlite"));
      raw.exec("CREATE TABLE leftover (id integer)");
      raw.close();
      const events: string[] = [];

      await migrateCommand.run(
        applyCtx(["fresh", "--preview"], [], deployed(events)),
      );

      expect(events).toContain("wipe");
      expect(names("table")).not.toContain("leftover");
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
    });

    test("prints the restore point before it drops anything, and the next step after", async () => {
      await migrateCommand.run(applyCtx([]));
      const events: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => events.push(line));

      await migrateCommand.run(
        applyCtx(["fresh", "--env", "qa", "--yes"], [], deployed(events)),
      );

      const restore = events.indexOf("Restore point: bookmark b-1");
      expect(restore).toBeGreaterThan(-1);
      expect(events.indexOf("wipe")).toBeGreaterThan(restore);
      expect(events.at(-1)).toBe(
        "Load data with `plumix import` or `plumix sync push`.",
      );
    });

    test("deletes nothing when a plugin package ships no history", async () => {
      await migrateCommand.run(applyCtx([]));
      installPackage("@acme/plugin-bare", null);

      await expect(
        migrateCommand.run(
          applyCtx(
            ["fresh", "--yes"],
            [plugin("bare", "@acme/plugin-bare/schema")],
          ),
        ),
      ).rejects.toMatchObject({ code: "migrate_owner_history_missing" });

      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
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
        /^→ local · site\.sqlite\ncore: 0 applied, 5 pending\n {2}pending .+\n {2}pending .+\n {2}pending .+\n {2}pending .+\n {2}pending .+\n@acme\/plugin-widgets: 0 applied, 1 pending\n {2}pending 1970-01-01T00:00:01\.000Z [0-9a-f]{8}$/,
      );
    });
    test("lists each owner's applied and pending data migrations after the schema status", async () => {
      // A release that adds `a2` to the site's list.
      writeFileSync(join(dir, "data-1.mjs"), recording("a1"));
      writeFileSync(join(dir, "data-2.mjs"), recording("a1", "a2"));
      const withData = (argv: readonly string[], file: string) => {
        const ctx = applyCtx(argv);
        return {
          ...ctx,
          app: {
            ...ctx.app,
            config: { ...ctx.app.config, dataMigrations: file },
          },
        };
      };
      await migrateCommand.run(withData([], "./data-1.mjs"));
      const lines: string[] = [];
      vi.spyOn(report, "info").mockImplementation((line) => lines.push(line));

      await migrateCommand.run(withData(["status"], "./data-2.mjs"));

      expect(lines.slice(-3)).toEqual([
        "site: 1 data migration applied, 1 pending",
        "  applied a1",
        "  pending a2",
      ]);
      expect(lines.slice(0, 2)).toEqual([
        "→ local · site.sqlite",
        "core: 5 applied, 0 pending",
      ]);
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
      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
      expect(opened).toEqual(["site", "memory"]);
      expect(lines.join("\n")).toContain("drizzle/");

      lines.length = 0;
      await migrateCommand.run(applyCtx([]));
      expect(lines).toEqual(["→ local · site.sqlite", "core: up to date"]);
    });

    test("ignores the data-migrations tracking table as bookkeeping", async () => {
      await buildLegacy();
      new DatabaseSync(join(dir, "site.sqlite")).exec(
        "CREATE TABLE __plumix_data_migrations (owner text NOT NULL, name text NOT NULL, applied_at integer NOT NULL, PRIMARY KEY (owner, name))",
      );

      await migrateCommand.run(applyCtx([]));

      expect(trackingRows("__drizzle_migrations_core")).toBe(5);
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
