import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { CommandContext, PlumixApp } from "plumix";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { nodeSqlite } from "../node-sqlite.js";
import { migrateApplyCommand } from "./migrate-apply.js";

const PLUMIX_BIN = fileURLToPath(
  new URL("../../node_modules/.bin/plumix", import.meta.url),
);

// A consumer project in a temp dir, with this package's own `node_modules`
// linked in so `plumix` resolves from there the way it does from an app root.
const CONFIG = `import { auth, defineTheme, fallback, plumix } from "plumix";

export default plumix({
  runtime: { name: "stub", createHandler: () => ({ fetch: () => new Response("") }), generateEntry: () => "" },
  database: { kind: "stub", connect: () => ({ db: {} }) },
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
});
`;

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-migrate-"));
  symlinkSync(
    fileURLToPath(new URL("../../node_modules", import.meta.url)),
    join(dir, "node_modules"),
  );
  writeFileSync(join(dir, "plumix.config.mjs"), CONFIG, "utf8");
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
