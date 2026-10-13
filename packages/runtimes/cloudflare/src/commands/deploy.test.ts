import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext, PlumixApp } from "plumix";
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
import { getPlatformProxy } from "wrangler";

import { deployCommand, deployDeps } from "./deploy.js";
import { migrations, migrationsDeps } from "./migrations.js";

let app: PlumixApp;
let dir: string;
let events: string[];

beforeAll(async () => {
  ({ app } = await createDispatcherHarness());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-cf-deploy-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
  writeFileSync(
    join(dir, "wrangler.jsonc"),
    JSON.stringify({
      name: "site",
      main: ".plumix/worker.ts",
      compatibility_date: "2026-04-01",
      d1_databases: [
        {
          binding: "DB",
          database_name: "site",
          database_id: "11111111-1111-1111-1111-111111111111",
        },
      ],
    }),
  );
  events = [];
  vi.spyOn(deployDeps, "spawnInherit").mockImplementation((command, args) => {
    events.push([command, ...args].join(" "));
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function deployCtx(argv: readonly string[]): CommandContext {
  return {
    app,
    cwd: dir,
    configPath: join(dir, "plumix.config.ts"),
    argv,
    runtimeMigrations: migrations,
  };
}

describe("plumix deploy", () => {
  test("applies pending migrations to the remote D1, then runs wrangler deploy with its arguments", async () => {
    // The remote database, stood in for by a local one: what matters is that
    // the apply reaches it through remote bindings before wrangler deploys.
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
      async (options) => {
        events.push(`proxy remoteBindings=${String(options.remoteBindings)}`);
        const proxy = await getPlatformProxy({
          configPath: options.configPath,
          persist: false,
          remoteBindings: false,
        });
        const d1 = proxy.env.DB as D1Database;
        return {
          ...proxy,
          dispose: async () => {
            const { results } = await d1
              .prepare("SELECT count(*) AS n FROM __drizzle_migrations_core")
              .all<{ n: number }>();
            events.push(`core applied ${String(results[0]?.n)}`);
            await proxy.dispose();
          },
        };
      },
    );

    // The CLI reports each owner it applied on stderr.
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await deployCommand.run(deployCtx(["--minify"]));

    expect(events).toEqual([
      "proxy remoteBindings=true",
      "core applied 2",
      "wrangler deploy --minify",
    ]);
  });

  test("a failed apply exits before wrangler deploy runs", async () => {
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockRejectedValue(
      new Error("Authentication error [code: 10000]"),
    );

    await expect(deployCommand.run(deployCtx([]))).rejects.toThrow(
      "Authentication error",
    );

    expect(events).toEqual([]);
  });
});

describe("plumix deploy — data migrations", () => {
  // One local D1 kept on disk, so a second deploy sees what the first wrote.
  function localD1(): void {
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation((options) =>
      getPlatformProxy({
        configPath: options.configPath,
        persist: { path: join(dir, "state") },
        remoteBindings: false,
      }),
    );
  }

  // Its `up` inserts a settings row, which a rerun would fail on the key.
  function siteDataMigration(up: string): CommandContext {
    writeFileSync(
      join(dir, "data.mjs"),
      `export default [{ name: "seed-beta", async up({ db }) { ${up} } }];\n`,
    );
    const ctx = deployCtx([]);
    return {
      ...ctx,
      app: { ...app, config: { ...app.config, dataMigrations: "./data.mjs" } },
    };
  }

  const SEED_BETA = `await db.run("INSERT INTO settings (\\"group\\", key, value) VALUES ('flags', 'beta', 'true')");`;

  async function recorded(): Promise<unknown[]> {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath: join(dir, "wrangler.jsonc"),
      persist: { path: join(dir, "state") },
    });
    try {
      const { results } = await proxy.env.DB.prepare(
        "SELECT owner, name FROM __plumix_data_migrations",
      ).all();
      return results;
    } finally {
      await proxy.dispose();
    }
  }

  test("applies a pending data migration before wrangler deploy, and the next deploy reports it up to date", async () => {
    localD1();
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const ctx = siteDataMigration(SEED_BETA);

    await deployCommand.run(ctx);
    expect(lines.join("")).toMatch(/site: applied 1 data migration\n/);
    lines.length = 0;

    await deployCommand.run(ctx);

    expect(lines.join("")).toMatch(/site: data migrations up to date\n/);
    expect(events).toEqual(["wrangler deploy", "wrangler deploy"]);
    expect(await recorded()).toEqual([{ owner: "site", name: "seed-beta" }]);
  });

  test("a throwing data migration fails the deploy before wrangler runs, leaving it unrecorded", async () => {
    localD1();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await expect(
      deployCommand.run(
        siteDataMigration(`throw new Error("the flag is gone");`),
      ),
    ).rejects.toMatchObject({
      code: "migrate_data_failed",
      message: expect.stringMatching(
        /site.+"seed-beta".+the flag is gone/,
      ) as unknown,
    });

    expect(events).toEqual([]);
    expect(await recorded()).toEqual([]);
  });
});
