import { execFile } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CommandContext, PlumixApp } from "plumix";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { nodeSqlite } from "../node-sqlite.js";
import {
  PLUMIX_BIN,
  scaffoldConsumerProject,
  STUB_CONFIG,
} from "../test/consumer-project.js";
import { migrateApplyCommand } from "./migrate-apply.js";

let dir: string;

beforeAll(async () => {
  dir = scaffoldConsumerProject("plumix-node-migrate-", STUB_CONFIG);
  await promisify(execFile)(PLUMIX_BIN, ["migrate", "generate"], {
    cwd: dir,
  });
}, 60_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function context(app: unknown): CommandContext {
  return {
    app: app as PlumixApp,
    cwd: dir,
    configPath: join(dir, "plumix.config.mjs"),
    argv: [],
    runtimeMigrate: {},
  };
}

describe("migrate apply", () => {
  test("applies the generated set, triggers included, and a re-run applies nothing", async () => {
    const database = nodeSqlite({ path: join(dir, "data", "site.sqlite") });
    const inspect = () => {
      const { db } = database.connect({}, new Request("http://x"), {});
      return {
        triggers: db.all(
          sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`,
        ),
        applied: db.all(sql`SELECT id, hash FROM __drizzle_migrations`),
      };
    };

    await migrateApplyCommand.run(context({ config: { database } }));
    const first = inspect();
    expect(first.triggers).toContainEqual({
      name: "entries_change_feed_insert",
    });
    const generated = readdirSync(join(dir, "drizzle")).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(first.applied).toHaveLength(generated.length);

    await migrateApplyCommand.run(context({ config: { database } }));
    expect(inspect().applied).toEqual(first.applied);
  });
});
