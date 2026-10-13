import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MigrationLocation, PlumixApp } from "plumix";
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
  migrations.open({ cwd: dir, config: app.config, location, binding });

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

describe("cloudflare migrations", () => {
  test("opens the local D1 `plumix dev` reads, persisted under the project's .wrangler/state", async () => {
    writeWrangler([D1_ENTRY]);
    const calls = stubWrangler();

    const db = await open("local");
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

    const db = await open("local");
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

  test("--remote reaches the binding through wrangler's remote bindings", async () => {
    writeWrangler([D1_ENTRY]);
    const calls = stubWrangler();

    const db = await open("remote");
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

  test("with several D1 bindings, requires --binding and names the ones it found", async () => {
    writeWrangler([D1_ENTRY, { ...D1_ENTRY, binding: "ARCHIVE" }]);

    await expect(open("local")).rejects.toMatchObject({
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

    const db = await open("local", "ARCHIVE");
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
