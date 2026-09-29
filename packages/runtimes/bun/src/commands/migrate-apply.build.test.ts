import { execFile } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  BUN_CONFIG,
  plumixOn,
  scaffoldConsumerProject,
} from "../test/consumer-project.js";

let dir: string;

beforeAll(async () => {
  dir = scaffoldConsumerProject("plumix-bun-migrate-", BUN_CONFIG);
  const generated = await plumixOn("bun", dir, ["migrate", "generate"]);
  expect(generated).toMatchObject({ code: 0 });
}, 60_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The database is read back by `bun -e`: `bun:sqlite` exists only there.
async function inspect(): Promise<{
  triggers: string[];
  applied: number;
}> {
  const { stdout } = await promisify(execFile)(
    "bun",
    [
      "-e",
      `const { Database } = require("bun:sqlite");
       const db = new Database(${JSON.stringify(join(dir, "data/site.sqlite"))});
       console.log(JSON.stringify({
         triggers: db.query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").values().flat(),
         applied: db.query("SELECT count(*) FROM __drizzle_migrations").values()[0][0],
       }));`,
    ],
    { cwd: dir },
  );
  return JSON.parse(stdout) as { triggers: string[]; applied: number };
}

describe("bun --bun plumix migrate apply", () => {
  test("creates the schema under the project root, triggers included, and a re-run applies nothing", async () => {
    const first = await plumixOn("bun", dir, ["migrate", "apply"]);
    expect(first).toMatchObject({ code: 0 });

    const applied = await inspect();
    expect(applied.triggers).toEqual([
      "entries_change_feed_delete",
      "entries_change_feed_insert",
      "entries_change_feed_update",
    ]);
    const generated = readdirSync(join(dir, "drizzle")).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(applied.applied).toBe(generated.length);

    expect(await plumixOn("bun", dir, ["migrate", "apply"])).toMatchObject({
      code: 0,
    });
    expect((await inspect()).applied).toBe(generated.length);
  });
});

describe("plumix migrate apply under node", () => {
  test("fails with the typed error naming `bun --bun` as the fix", async () => {
    const result = await plumixOn("node", dir, ["migrate", "apply"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bun_required:");
    expect(result.stderr).toContain("bun --bun plumix");
    expect(result.stderr).not.toContain("UNEXPECTED");
  });
});
