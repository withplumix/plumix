import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";

import type { Db } from "../../context/app-context.js";
import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { DatabaseAdapter } from "../../runtime/contract/slots.js";
import type { ContractCase } from "./case.js";
import {
  CORE_SQL_MIGRATIONS,
  planRawSqlMigrations,
} from "../../cli/raw-migrations.js";
import { rowsAffected } from "../../db/rows-affected.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { entries } from "../../db/schema/entries.js";
import { entryChanges } from "../../db/schema/entry_changes.js";
import * as schema from "../../db/schema/index.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { factoriesFor } from "../factories.js";
import { applyCoreTestSchema, compileSchemaSql } from "../harness.js";
import { describeContract } from "./case.js";

/** The adapter under test and the env its `connect` binds against. */
export interface DatabaseContractBinding {
  readonly adapter: DatabaseAdapter;
  readonly env?: PlumixEnv;
}

export interface DatabaseContractOptions {
  /**
   * Bind a database for one case. Every case gets its own, so the database
   * the adapter connects to must start empty and must not share tables with
   * a previously returned one.
   */
  readonly connect: () =>
    DatabaseContractBinding | Promise<DatabaseContractBinding>;
}

type Case = ContractCase<DatabaseContractOptions>;

// Lands in `users.email_verified_at`, whose name differs between the schema
// and the table, stored in seconds.
const VERIFIED_AT = new Date(Date.UTC(2030, 0, 1));

async function withDb(
  options: DatabaseContractOptions,
  run: (db: Db) => Promise<void>,
): Promise<void> {
  const { adapter, env = {} } = await options.connect();
  const connected = adapter.connect(
    env,
    new Request("https://conformance.test/"),
    schema,
  );
  try {
    await run(connected.db as Db);
  } finally {
    connected.close?.();
  }
}

function withCoreSchema(
  options: DatabaseContractOptions,
  run: (db: Db) => Promise<void>,
): Promise<void> {
  return withDb(options, async (db) => {
    await applyCoreTestSchema(db);
    await run(db);
  });
}

// drizzle-kit's marker between two statements of one migration file. Every
// drizzle migrator splits a file on it, so a statement is what runs whole.
const BREAKPOINT = "--> statement-breakpoint";

// The files `plumix migrate generate` writes for core alone, in journal
// order: drizzle-kit's create-from-empty diff, then core's raw SQL
// migrations numbered behind it.
async function generatedMigrationSet(): Promise<string[]> {
  const tables = await compileSchemaSql(schema);
  const plan = planRawSqlMigrations(
    CORE_SQL_MIGRATIONS,
    {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 1, tag: "0000_core", breakpoints: true },
      ],
    },
    2,
  );
  return [
    tables.join(`\n${BREAKPOINT}\n`),
    ...plan.emit.map((migration) => migration.sql),
  ];
}

async function applyMigrationSet(
  db: Db,
  files: readonly string[],
): Promise<void> {
  for (const file of files) {
    for (const statement of file.split(BREAKPOINT)) {
      if (statement.trim() !== "") await db.run(sql.raw(statement));
    }
  }
}

/** Every case of the database contract, for guard tests that run them outside vitest. */
export const databaseContractCases: readonly Case[] = [
  {
    name: "a camelCase field is written to and read from its snake_case column",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const user = await factoriesFor(db).user.create({
          emailVerifiedAt: VERIFIED_AT,
        });

        expect(
          await db.all(
            sql`SELECT email_verified_at FROM users WHERE id = ${user.id}`,
          ),
        ).toEqual([{ email_verified_at: VERIFIED_AT.valueOf() / 1000 }]);
        expect(
          await db
            .select({ emailVerifiedAt: users.emailVerifiedAt })
            .from(users),
        ).toEqual([{ emailVerifiedAt: VERIFIED_AT }]);
      }),
  },
  {
    name: "returning hands back the rows the write produced",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const inserted = await db
          .insert(users)
          .values([
            { email: "ada@example.test", slug: "ada" },
            { email: "grace@example.test", slug: "grace" },
          ])
          .returning({ id: users.id, email: users.email });
        expect(inserted).toEqual([
          { id: 1, email: "ada@example.test" },
          { id: 2, email: "grace@example.test" },
        ]);

        const updated = await db
          .update(users)
          .set({ name: "Grace" })
          .where(eq(users.slug, "grace"))
          .returning({ id: users.id, name: users.name });
        expect(updated).toEqual([{ id: 2, name: "Grace" }]);
      }),
  },
  {
    name: "a join reads columns from both tables",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const factories = factoriesFor(db);
        const author = await factories.user.create({ slug: "ada" });
        await factories.entry.create({ authorId: author.id, slug: "hello" });

        expect(
          await db
            .select({ slug: entries.slug, author: users.slug })
            .from(entries)
            .innerJoin(users, eq(users.id, entries.authorId)),
        ).toEqual([{ slug: "hello", author: "ada" }]);
      }),
  },
  {
    name: "a relational findFirst reads one row by its filter",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const factories = factoriesFor(db);
        await factories.user.create({ slug: "ada" });
        const grace = await factories.user.create({ slug: "grace" });

        expect(
          await db.query.users.findFirst({
            columns: { id: true, slug: true, emailVerifiedAt: true },
            where: eq(users.slug, "grace"),
          }),
        ).toEqual({ id: grace.id, slug: "grace", emailVerifiedAt: null });
        expect(
          await db.query.users.findFirst({ where: eq(users.slug, "nobody") }),
        ).toBeUndefined();
      }),
  },
  {
    name: "rowsAffected counts the rows an update and a delete changed",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const factories = factoriesFor(db);
        await factories.user.createList(3, { role: "editor" });
        await factories.user.create({ role: "admin" });

        expect(
          rowsAffected(
            await db
              .update(users)
              .set({ role: "author" })
              .where(eq(users.role, "editor")),
          ),
        ).toBe(3);
        expect(
          rowsAffected(
            await db.update(users).set({ name: "x" }).where(eq(users.id, 99)),
          ),
        ).toBe(0);
        expect(
          rowsAffected(await db.delete(users).where(eq(users.role, "author"))),
        ).toBe(3);
      }),
  },
  {
    // Each write below fires a change-feed trigger that inserts into
    // `entry_changes`. A driver counting the trigger's row reports 2.
    name: "rowsAffected leaves out the rows a trigger wrote",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const factories = factoriesFor(db);
        const author = await factories.user.create();
        const entry = await factories.entry.create({ authorId: author.id });

        expect(
          rowsAffected(
            await db
              .update(entries)
              .set({ title: "Renamed" })
              .where(eq(entries.id, entry.id)),
          ),
        ).toBe(1);
        expect(
          rowsAffected(
            await db.delete(entries).where(eq(entries.id, entry.id)),
          ),
        ).toBe(1);
        expect(
          await db
            .select({ kind: entryChanges.kind })
            .from(entryChanges)
            .orderBy(entryChanges.id),
        ).toEqual([{ kind: "upsert" }, { kind: "upsert" }, { kind: "delete" }]);
      }),
  },
  {
    // What a column does not map, the driver binds — so a plugin's raw query
    // is only portable if every driver binds a Date and a boolean alike.
    name: "a raw sql Date binds as epoch milliseconds and a boolean as 1 or 0",
    run: (options) =>
      withDb(options, async (db) => {
        const at = new Date(Date.UTC(2030, 0, 1));
        await db.run(
          sql`CREATE TABLE flags (id INTEGER PRIMARY KEY, on_ INTEGER, at INTEGER)`,
        );
        await db.run(sql`INSERT INTO flags (on_, at) VALUES (${true}, ${at})`);
        await db.run(sql`INSERT INTO flags (on_, at) VALUES (${false}, ${at})`);

        expect(
          await db.all(sql`SELECT id, on_, at FROM flags ORDER BY id`),
        ).toEqual([
          { id: 1, on_: 1, at: 1_893_456_000_000 },
          { id: 2, on_: 0, at: 1_893_456_000_000 },
        ]);
        expect(
          await db.all(
            sql`SELECT id FROM flags WHERE on_ = ${false} AND at = ${at}`,
          ),
        ).toEqual([{ id: 2 }]);
      }),
  },
  {
    // SQLite ships with foreign keys off; a connection that never turns them
    // on leaves a deleted user's tokens behind, still able to sign in.
    name: "deleting a user cascades to its tokens and sessions",
    run: (options) =>
      withCoreSchema(options, async (db) => {
        const factories = factoriesFor(db);
        const [ada, grace] = await factories.user.createList(2);
        if (!ada || !grace) throw new Error("userFactory created no users");
        for (const user of [ada, grace]) {
          await factories.authToken.create({ userId: user.id });
          await factories.session.create({ userId: user.id });
        }

        await db.delete(users).where(eq(users.id, ada.id));

        expect(
          await db.select({ userId: authTokens.userId }).from(authTokens),
        ).toEqual([{ userId: grace.id }]);
        expect(
          await db.select({ userId: sessions.userId }).from(sessions),
        ).toEqual([{ userId: grace.id }]);
      }),
  },
  {
    // A trigger body holds semicolons of its own, so a driver that splits a
    // statement on them, or runs only the first, loses the change feed.
    name: "a generated migration set leaves the change-feed triggers in place",
    run: (options) =>
      withDb(options, async (db) => {
        await applyMigrationSet(db, await generatedMigrationSet());

        expect(
          await db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`,
          ),
        ).toEqual([
          { name: "entries_change_feed_delete" },
          { name: "entries_change_feed_insert" },
          { name: "entries_change_feed_update" },
        ]);

        const factories = factoriesFor(db);
        const author = await factories.user.create();
        const entry = await factories.entry.create({ authorId: author.id });
        expect(
          await db
            .select({ entryId: entryChanges.entryId, kind: entryChanges.kind })
            .from(entryChanges),
        ).toEqual([{ entryId: entry.id, kind: "upsert" }]);
      }),
  },
];

/**
 * Assert a `database:` slot adapter satisfies the contract core relies on.
 * Call it at the top level of a test file with a factory that binds a fresh,
 * empty database.
 */
export function describeDatabaseContract(
  options: DatabaseContractOptions,
): void {
  describeContract("database contract", databaseContractCases, options);
}
