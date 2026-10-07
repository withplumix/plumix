import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  BUN_CONFIG,
  plumixOn,
  scaffoldConsumerProject,
} from "../test/consumer-project.js";

let dir: string;

beforeEach(() => {
  dir = scaffoldConsumerProject("plumix-bun-migrate-", BUN_CONFIG);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The database is read and written by `bun -e`: `bun:sqlite` exists only there.
async function onDatabase(script: string): Promise<unknown> {
  const { stdout } = await promisify(execFile)(
    "bun",
    [
      "-e",
      `const { Database } = require("bun:sqlite");
       const db = new Database(${JSON.stringify(join(dir, "data/site.sqlite"))});
       console.log(JSON.stringify((() => { ${script} })() ?? null));`,
    ],
    { cwd: dir },
  );
  return JSON.parse(stdout) as unknown;
}

const triggers = () =>
  onDatabase(
    `return db.query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").values().flat();`,
  );

describe("bun --bun plumix migrate", () => {
  test("creates the schema under the project root, triggers included, and a re-run applies nothing", async () => {
    const first = await plumixOn("bun", dir, ["migrate"]);
    expect(first).toMatchObject({ code: 0 });
    expect(first.stderr).toContain("core: applied 2 migrations");
    expect(await triggers()).toEqual([
      "entries_change_feed_delete",
      "entries_change_feed_insert",
      "entries_change_feed_update",
    ]);

    const second = await plumixOn("bun", dir, ["migrate"]);
    expect(second).toMatchObject({ code: 0 });
    expect(second.stderr).toContain("core: up to date");
  });

  test("adopts a database a legacy single history built, running no DDL", async () => {
    // A legacy database: the same schema, recorded in drizzle's default
    // tracking table rather than core's.
    expect(await plumixOn("bun", dir, ["migrate"])).toMatchObject({ code: 0 });
    await onDatabase(
      `db.exec("ALTER TABLE __drizzle_migrations_core RENAME TO __drizzle_migrations");`,
    );

    const adopted = await plumixOn("bun", dir, ["migrate"]);
    expect(adopted).toMatchObject({ code: 0 });
    expect(adopted.stderr).toContain("drizzle/ folder is no longer read");
    expect((await plumixOn("bun", dir, ["migrate"])).stderr).toContain(
      "core: up to date",
    );
  });

  test("--remote fails naming the runtime", async () => {
    const result = await plumixOn("bun", dir, ["migrate", "--remote"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("migrate_remote_unsupported");
    expect(result.stderr).toContain("bun runtime");
  });
});

describe("plumix migrate under node", () => {
  test("fails with the typed error naming `bun --bun` as the fix", async () => {
    const result = await plumixOn("node", dir, ["migrate"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bun_required:");
    expect(result.stderr).toContain("bun --bun plumix");
    expect(result.stderr).not.toContain("UNEXPECTED");
  });
});
