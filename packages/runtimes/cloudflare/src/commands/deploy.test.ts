import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

import { deployCommand, deployDeps, previewCommand } from "./deploy.js";
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
  vi.spyOn(deployDeps, "build").mockImplementation(() => {
    events.push(`build CLOUDFLARE_ENV=${process.env.CLOUDFLARE_ENV ?? ""}`);
    return Promise.resolve();
  });
  vi.spyOn(deployDeps, "spawnInherit").mockImplementation(
    (command, args, options) => {
      const env = options.env?.CLOUDFLARE_ENV;
      events.push(
        [env === undefined ? [] : [`CLOUDFLARE_ENV=${env}`], command, ...args]
          .flat()
          .join(" "),
      );
      return Promise.resolve();
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
      "build CLOUDFLARE_ENV=",
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

    expect(events).toEqual(["build CLOUDFLARE_ENV="]);
  });
});

describe("plumix deploy and plumix preview — targets", () => {
  function writeConfig(config: object): void {
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      JSON.stringify({
        name: "site",
        main: ".plumix/worker.ts",
        compatibility_date: "2026-04-01",
        d1_databases: [d1("site-prod", "prod-id")],
        ...config,
      }),
    );
  }

  const d1 = (name: string, id: string) => ({
    binding: "DB",
    database_name: name,
    database_id: id,
  });

  // Records the database each migration reached; applies nothing.
  function stubReachedDatabases(): void {
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
      (options) => {
        const config = JSON.parse(
          readFileSync(options.configPath ?? "", "utf8"),
        ) as { d1_databases: { database_id: string }[] };
        events.push(`migrate ${config.d1_databases[0]?.database_id ?? ""}`);
        return Promise.reject(new Error("stop after reaching the database"));
      },
    );
  }

  test("deploy --env qa builds and ships qa after migrating qa's database", async () => {
    writeConfig({ env: { qa: { d1_databases: [d1("site-qa", "qa-id")] } } });
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
      async (options) => {
        const config = JSON.parse(
          readFileSync(options.configPath ?? "", "utf8"),
        ) as { d1_databases: { database_id: string }[] };
        events.push(`migrate ${config.d1_databases[0]?.database_id ?? ""}`);
        return getPlatformProxy({
          configPath: options.configPath,
          persist: false,
          remoteBindings: false,
        });
      },
    );
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await deployCommand.run(deployCtx(["--env", "qa", "--minify"]));

    expect(events).toEqual([
      "build CLOUDFLARE_ENV=qa",
      "migrate qa-id",
      "CLOUDFLARE_ENV=qa wrangler deploy --env qa --minify",
    ]);
  });

  test("deploy --env fails before building when CLOUDFLARE_ENV names another environment", async () => {
    vi.stubEnv("CLOUDFLARE_ENV", "staging");
    writeConfig({ env: { qa: { d1_databases: [d1("site-qa", "qa-id")] } } });

    await expect(
      deployCommand.run(deployCtx(["--env=qa"])),
    ).rejects.toMatchObject({ code: "deploy_env_conflict" });

    expect(events).toEqual([]);
  });

  test("preview migrates the Worker Previews database, then runs wrangler preview with its arguments", async () => {
    writeConfig({
      previews: { d1_databases: [d1("site-preview", "preview-id")] },
    });
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
      async (options) => {
        const config = JSON.parse(
          readFileSync(options.configPath ?? "", "utf8"),
        ) as { d1_databases: { database_id: string }[] };
        events.push(`migrate ${config.d1_databases[0]?.database_id ?? ""}`);
        return getPlatformProxy({
          configPath: options.configPath,
          persist: false,
          remoteBindings: false,
        });
      },
    );
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await previewCommand.run(deployCtx(["--name", "feat-x"]));

    expect(events).toEqual([
      "build CLOUDFLARE_ENV=",
      "migrate preview-id",
      "wrangler preview --name feat-x",
    ]);
  });

  test("preview --env qa migrates the previews database qa resolves to", async () => {
    writeConfig({
      env: {
        qa: {
          d1_databases: [d1("site-qa", "qa-id")],
          previews: { d1_databases: [d1("qa-preview", "qa-preview-id")] },
        },
      },
    });
    stubReachedDatabases();

    await expect(
      previewCommand.run(deployCtx(["--env", "qa"])),
    ).rejects.toThrow("stop after reaching the database");

    expect(events).toEqual([
      "build CLOUDFLARE_ENV=qa",
      "migrate qa-preview-id",
    ]);
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

  test("applies a pending data migration before wrangler deploy", async () => {
    localD1();
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    await deployCommand.run(siteDataMigration(SEED_BETA));

    expect(lines.join("")).toMatch(/site: applied 1 data migration\n/);
    expect(events).toEqual(["build CLOUDFLARE_ENV=", "wrangler deploy"]);
    expect(await recorded()).toEqual([{ owner: "site", name: "seed-beta" }]);
  });

  test("the next deploy reports the data migration up to date", async () => {
    localD1();
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const ctx = siteDataMigration(SEED_BETA);
    await deployCommand.run(ctx);
    lines.length = 0;

    await deployCommand.run(ctx);

    expect(lines.join("")).toMatch(/site: data migrations up to date\n/);
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

    expect(events).toEqual(["build CLOUDFLARE_ENV="]);
    expect(await recorded()).toEqual([]);
  });
});
