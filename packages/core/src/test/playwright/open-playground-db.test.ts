import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, test } from "vitest";

import { openPlaygroundDb } from "./open-playground-db.js";

const tempDirs: string[] = [];

async function makePlaygroundTemp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "plumix-playground-"));
  tempDirs.push(dir);
  return dir;
}

async function seedSqlite(
  path: string,
  statements: readonly string[],
): Promise<void> {
  const client = createClient({ url: `file:${path}` });
  for (const stmt of statements) await client.execute(stmt);
  client.close();
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("openPlaygroundDb", () => {
  test("opens the user-db sqlite under .wrangler/state and returns a queryable Db", async () => {
    const cwd = await makePlaygroundTemp();
    const stateDir = join(
      cwd,
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );
    await mkdir(stateDir, { recursive: true });
    const dbPath = join(stateDir, "abc123.sqlite");
    await seedSqlite(dbPath, [
      "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      "INSERT INTO probe (value) VALUES ('hello')",
    ]);

    const db = await openPlaygroundDb({ cwd });
    const result = await db.$client.execute("SELECT value FROM probe");

    expect(result.rows[0]?.value).toBe("hello");
  });

  test("throws a clear error when the wrangler state dir is missing", async () => {
    const cwd = await makePlaygroundTemp();

    await expect(openPlaygroundDb({ cwd })).rejects.toThrow(
      /no D1 state at .*\.wrangler\/state.*plumix dev/,
    );
  });

  test("throws when multiple user sqlite files are present (binding lookup not yet supported)", async () => {
    const cwd = await makePlaygroundTemp();
    const stateDir = join(
      cwd,
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "one.sqlite"), "");
    await writeFile(join(stateDir, "two.sqlite"), "");
    await writeFile(join(stateDir, "metadata.sqlite"), "");

    await expect(openPlaygroundDb({ cwd })).rejects.toThrow(
      /multiple D1 sqlite files.*binding-based lookup/i,
    );
  });
});
