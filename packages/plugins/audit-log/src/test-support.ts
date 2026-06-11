import type { AppContext } from "plumix/plugin";
import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { Factory } from "fishery";

import type { NewAuditLogRow } from "./db/schema.js";
import * as schema from "./db/schema.js";
import { auditLog } from "./db/schema.js";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const schemaImports = schema as unknown as Record<string, unknown>;
let cachedStatements: string[] | null = null;

// drizzle-kit's `api` surface is loosely typed (`SQLiteSchema` is opaque);
// we treat it as a black-box snapshot blob and only read its `id` field.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
async function compileSchemaSql(): Promise<string[]> {
  if (cachedStatements) return cachedStatements;
  const empty = await generateSQLiteDrizzleJson({}, undefined, "snake_case");
  const current = await generateSQLiteDrizzleJson(
    schemaImports,
    empty.id,
    "snake_case",
  );
  cachedStatements = await generateSQLiteMigration(empty, current);
  return cachedStatements;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

export async function createDb(): Promise<TestDb> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema, casing: "snake_case" });
  for (const stmt of await compileSchemaSql()) await db.run(sql.raw(stmt));
  return db;
}

export function ctxFor(db: TestDb): AppContext {
  return { db } as unknown as AppContext;
}

interface DbTransient {
  db: TestDb;
}

function requireDb(transient: Partial<DbTransient>): TestDb {
  if (!transient.db) {
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    throw new Error("auditLogFactory requires a db via .transient({ db })");
  }
  return transient.db;
}

type AuditLogRow = typeof auditLog.$inferSelect;

export const auditLogFactory = Factory.define<
  NewAuditLogRow,
  DbTransient,
  AuditLogRow
>(({ transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = requireDb(transientParams);
    const [row] = await db.insert(auditLog).values(attrs).returning();
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    if (!row) throw new Error("auditLogFactory: insert returned no row");
    return row;
  });

  return {
    event: params.event ?? "entry:updated",
    subjectType: params.subjectType ?? "entry",
    subjectId: params.subjectId ?? "1",
    subjectLabel: params.subjectLabel ?? "Hello",
    actorId: params.actorId ?? 1,
    actorLabel: params.actorLabel ?? "alice@example.com",
    properties: params.properties ?? {},
    occurredAt: params.occurredAt ?? new Date(),
  };
});
