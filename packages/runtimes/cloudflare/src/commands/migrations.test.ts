import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MigrationLocation, PlumixApp } from "plumix";
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

import { migrations, migrationsDeps } from "./migrations.js";

/** Core's shipped history, read from the workspace. */
const CORE = {
  migrationsFolder: fileURLToPath(
    new URL("../../../../core/migrations", import.meta.url),
  ),
  migrationsTable: "__drizzle_migrations_core",
};

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
  migrations.open({ cwd: dir, app, location, binding });

/** The glob the playground's e2e reads its database from. */
const localDatabases = () =>
  globSync(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite", {
    cwd: dir,
  }).filter((file) => !file.endsWith("metadata.sqlite"));

// Each test starts one proxy: a workerd start is most of its time.

describe("cloudflare migrations", () => {
  test("applies locally to the D1 `plumix dev` reads, under the project's .wrangler/state", async () => {
    writeWrangler([D1_ENTRY]);

    const db = await open("local");
    try {
      await db.migrate(CORE);
      expect(
        await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'"),
      ).toHaveLength(3);
    } finally {
      await db.close();
    }

    expect(localDatabases()).toHaveLength(1);
  });

  test("a memory database leaves the local one alone", async () => {
    writeWrangler([D1_ENTRY]);

    const db = await open("memory");
    try {
      await db.migrate(CORE);
    } finally {
      await db.close();
    }

    expect(localDatabases()).toEqual([]);
  });

  test("--remote reaches the binding through wrangler's remote bindings", async () => {
    writeWrangler([D1_ENTRY]);
    const seen: { options: unknown; config: unknown }[] = [];
    // The proxy wrangler would start against the remote database, stood in
    // for by a local one: what reaches wrangler is the point here.
    vi.spyOn(migrationsDeps, "getPlatformProxy").mockImplementation(
      async (options) => {
        seen.push({
          options,
          config: JSON.parse(
            readFileSync(options.configPath ?? "", "utf8"),
          ) as unknown,
        });
        return getPlatformProxy({
          configPath: options.configPath,
          persist: false,
          remoteBindings: false,
        });
      },
    );

    const db = await open("remote");
    try {
      await db.migrate(CORE);
      expect(
        await db.all("SELECT count(*) AS n FROM __drizzle_migrations_core"),
      ).toEqual([{ n: 2 }]);
    } finally {
      await db.close();
    }

    expect(seen).toEqual([
      {
        options: expect.objectContaining({
          remoteBindings: true,
          persist: false,
        }) as unknown,
        config: expect.objectContaining({
          account_id: "acc123",
          d1_databases: [{ ...D1_ENTRY, remote: true }],
        }) as unknown,
      },
    ]);
  });

  test("with several D1 bindings, requires --binding and names the ones it found", async () => {
    writeWrangler([D1_ENTRY, { ...D1_ENTRY, binding: "ARCHIVE" }]);

    await expect(open("local")).rejects.toMatchObject({
      code: "migrate_ambiguous_binding",
      message: expect.stringContaining("DB, ARCHIVE") as unknown,
    });

    const db = await open("local", "ARCHIVE");
    await db.close();
  });

  test("refuses a --binding the config does not declare", async () => {
    writeWrangler([D1_ENTRY]);

    await expect(open("local", "NOPE")).rejects.toMatchObject({
      code: "migrate_unknown_binding",
    });
  });

  test("refuses a project with no D1 binding", async () => {
    writeWrangler([]);

    await expect(open("local")).rejects.toMatchObject({
      code: "migrate_no_d1",
    });
  });
});
