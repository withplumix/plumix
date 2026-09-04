import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

import { openPlaygroundDb } from "./open-playground-db.js";
import {
  CLOUDFLARE_E2E,
  runtimePackage,
  usePlaygrounds,
} from "./playground-fixture.js";

const playground = usePlaygrounds();

async function seedSqlite(
  path: string,
  statements: readonly string[],
): Promise<void> {
  const client = createClient({ url: `file:${path}` });
  for (const stmt of statements) await client.execute(stmt);
  client.close();
}

describe("openPlaygroundDb", () => {
  test("opens the sqlite the runtime's e2e block points at and returns a queryable Db", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);
    const stateDir = join(
      cwd,
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );
    await mkdir(stateDir, { recursive: true });
    await seedSqlite(join(stateDir, "metadata.sqlite"), []);
    await seedSqlite(join(stateDir, "abc123.sqlite"), [
      "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      "INSERT INTO probe (value) VALUES ('hello')",
    ]);

    const db = await openPlaygroundDb({ cwd });
    const result = await db.$client.execute("SELECT value FROM probe");

    expect(result.rows[0]?.value).toBe("hello");
  });

  test("fails readably when the runtime declares no e2e block", async () => {
    const cwd = await playground([runtimePackage("@plumix/runtime-node")]);

    await expect(openPlaygroundDb({ cwd })).rejects.toThrow(
      /@plumix\/runtime-node declares no "plumix\.e2e" block/,
    );
  });

  test("fails readably before the database has been created", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);

    await expect(openPlaygroundDb({ cwd })).rejects.toThrow(
      /no database matches .*miniflare-D1DatabaseObject.*plumix migrate apply/,
    );
  });
});
