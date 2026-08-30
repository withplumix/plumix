import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { spawnCapturingStderr } from "@plumix/core";

import {
  emitRawSqlMigrations,
  migrateGenerateDeps,
} from "../src/cli/commands/migrate.js";

/**
 * `migrate generate` leans on two properties of the pinned drizzle-kit that
 * are not documented contracts: a successful generate stays silent on
 * stderr, and a journal entry with no snapshot beside it is tolerated.
 * These run the real binary so a `catalog:drizzle` bump breaks here rather
 * than in every build in the repo.
 */

let dir: string;

const SCHEMA = `
  import { sqliteTable } from "drizzle-orm/sqlite-core";

  export const widgets = sqliteTable("widgets", (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    name: t.text().notNull(),
  }));
`;

const SCHEMA_WITH_SECOND_TABLE = `${SCHEMA}
  export const gadgets = sqliteTable("gadgets", (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
  }));
`;

const SEARCH_PLUGIN = {
  id: "search",
  setup: () => undefined,
  sqlMigrations: [
    {
      name: "widget_fts",
      statements: [
        "CREATE VIRTUAL TABLE `widget_fts` USING fts5(name, content='widgets', content_rowid='id')",
        "CREATE TRIGGER `widget_fts_ai` AFTER INSERT ON `widgets` BEGIN\n" +
          "  INSERT INTO `widget_fts`(rowid, name) VALUES (new.id, new.name);\n" +
          "END",
      ],
    },
  ],
};

function generate(): Promise<string> {
  const bin = migrateGenerateDeps.resolveDrizzleKitBin(dir);
  if (bin === null) throw new Error("drizzle-kit did not resolve");
  return spawnCapturingStderr(
    process.execPath,
    [
      "--no-warnings",
      bin,
      "generate",
      "--schema",
      "schema.ts",
      "--dialect",
      "sqlite",
      "--out",
      "drizzle",
      "--casing",
      "snake_case",
    ],
    { cwd: dir, env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined } },
  );
}

async function generateOrThrow(): Promise<void> {
  const stderr = await generate();
  if (stderr.trim() !== "") throw new Error(stderr);
}

function journalTags(): readonly string[] {
  const journal = JSON.parse(
    readFileSync(join(dir, "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

/** Apply every migration the journal names, the way the migrator does. */
function applyMigrations(db: DatabaseSync): void {
  for (const tag of journalTags()) {
    const sql = readFileSync(join(dir, `drizzle/${tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") db.exec(statement);
    }
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-drizzle-contract-"));
  writeFileSync(join(dir, "schema.ts"), SCHEMA, "utf8");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Each `generate` spawns drizzle-kit, which bundles the schema with esbuild
// before it can diff — past vitest's 5s default on a cold runner, so every
// test carries its own budget.
const ONE_SPAWN = 60_000;
const TWO_SPAWNS = 120_000;

describe("drizzle-kit's stderr contract", () => {
  test(
    "a generate that writes a migration says nothing on stderr",
    async () => {
      await expect(generate()).resolves.toBe("");
    },
    ONE_SPAWN,
  );

  test(
    "a generate with nothing to do says nothing on stderr",
    async () => {
      await generate();

      await expect(generate()).resolves.toBe("");
    },
    TWO_SPAWNS,
  );
});

describe("plugin-contributed raw SQL", () => {
  test(
    "a later schema change is numbered past the raw migration",
    async () => {
      await generateOrThrow();
      emitRawSqlMigrations(dir, [SEARCH_PLUGIN]);

      writeFileSync(join(dir, "schema.ts"), SCHEMA_WITH_SECOND_TABLE, "utf8");
      await generateOrThrow();

      expect(journalTags()).toEqual([
        expect.stringMatching(/^0000_/) as unknown as string,
        "0001_plumix_search_widget_fts",
        expect.stringMatching(/^0002_/) as unknown as string,
      ]);
    },
    TWO_SPAWNS,
  );

  test(
    "applying the generated set creates the virtual table and its trigger",
    async () => {
      await generateOrThrow();
      emitRawSqlMigrations(dir, [SEARCH_PLUGIN]);
      writeFileSync(join(dir, "schema.ts"), SCHEMA_WITH_SECOND_TABLE, "utf8");
      await generateOrThrow();

      const db = new DatabaseSync(":memory:");
      applyMigrations(db);
      db.exec("INSERT INTO widgets (name) VALUES ('gizmo')");

      expect(
        db
          .prepare(
            "SELECT rowid AS id FROM widget_fts WHERE widget_fts MATCH 'gizmo'",
          )
          .all(),
      ).toEqual([{ id: 1 }]);
      db.close();
    },
    TWO_SPAWNS,
  );
});
