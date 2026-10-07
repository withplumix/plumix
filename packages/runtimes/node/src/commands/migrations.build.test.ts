import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  CLI_ENV,
  PLUMIX_BIN,
  scaffoldConsumerProject,
} from "../test/consumer-project.js";

const CONFIG = `import { auth } from "plumix/auth";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { node, nodeSqlite } from "@plumix/runtime-node";

export default plumix({
  runtime: node(),
  database: nodeSqlite({ path: "data/site.sqlite" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
});
`;

let dir: string;

beforeEach(() => {
  dir = scaffoldConsumerProject("plumix-node-migrate-", CONFIG);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function plumix(
  ...args: string[]
): Promise<{ code: number; stderr: string }> {
  try {
    const { stderr } = await promisify(execFile)(PLUMIX_BIN, args, {
      cwd: dir,
      env: CLI_ENV,
    });
    return { code: 0, stderr };
  } catch (error) {
    const failed = error as { code?: number; stderr?: string };
    return { code: failed.code ?? 1, stderr: failed.stderr ?? "" };
  }
}

function query(sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(join(dir, "data/site.sqlite"));
  try {
    return db.prepare(sql).all() as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

const schema = () =>
  query(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\' ORDER BY name",
  );

// A legacy database: the site's single `drizzle/` history, recorded in
// drizzle's default table.
async function buildLegacyDatabase(): Promise<void> {
  expect(await plumix("migrate", "generate")).toMatchObject({ code: 0 });
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { drizzleNodeSqlite, openNodeSqlite } =
    await import("../node-sqlite-client.js");
  const client = openNodeSqlite(join(dir, "data/site.sqlite"));
  try {
    migrate(drizzleNodeSqlite(client, {}), {
      migrationsFolder: join(dir, "drizzle"),
    });
  } finally {
    client.close();
  }
}

describe("plumix migrate on the node runtime", () => {
  test("creates core's tables and triggers under core's tracking table, and a re-run applies nothing", async () => {
    const first = await plumix("migrate");
    expect(first).toMatchObject({ code: 0 });
    expect(first.stderr).toContain("core: applied 2 migrations");
    expect(
      query(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
      ),
    ).toEqual([
      { name: "entries_change_feed_delete" },
      { name: "entries_change_feed_insert" },
      { name: "entries_change_feed_update" },
    ]);

    const second = await plumix("migrate");
    expect(second).toMatchObject({ code: 0 });
    expect(second.stderr).toContain("core: up to date");
    expect(
      query("SELECT count(*) AS n FROM __drizzle_migrations_core"),
    ).toEqual([{ n: 2 }]);
  });

  test("adopts a database the legacy generate-and-apply built, running no DDL", async () => {
    await buildLegacyDatabase();
    const before = schema();

    const adopted = await plumix("migrate");
    expect(adopted.stderr).toContain("drizzle/ folder is no longer read");
    expect(adopted).toMatchObject({ code: 0 });
    expect(schema()).toEqual(before);

    expect((await plumix("migrate")).stderr).toContain("core: up to date");
  });

  test("refuses to adopt a legacy database with an altered column, naming it", async () => {
    await buildLegacyDatabase();
    const db = new DatabaseSync(join(dir, "data/site.sqlite"));
    db.exec("ALTER TABLE users RENAME COLUMN name TO full_name");
    db.close();
    const before = query("SELECT name, sql FROM sqlite_master ORDER BY name");

    const refused = await plumix("migrate");

    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("migrate_adoption_mismatch");
    expect(refused.stderr).toContain('table users: column "full_name"');
    expect(query("SELECT name, sql FROM sqlite_master ORDER BY name")).toEqual(
      before,
    );
  });

  test("--remote fails naming the runtime", async () => {
    const result = await plumix("migrate", "--remote");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("migrate_remote_unsupported");
    expect(result.stderr).toContain("node runtime");
  });
});
