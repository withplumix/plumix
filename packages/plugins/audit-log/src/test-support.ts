import type { AppContext } from "plumix/plugin";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Factory } from "fishery";
import { applyTestSchema, createTestContext } from "plumix/test";

import type { NewAuditLogRow } from "./db/schema.js";
import * as schema from "./db/schema.js";
import { auditLog } from "./db/schema.js";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** In-memory db with only the plugin's own tables — no core schema. */
export async function createDb(): Promise<TestDb> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema, casing: "snake_case" });
  await applyTestSchema(db, schema);
  return db;
}

/** An `AppContext` over the plugin's test db, for storage-adapter tests. */
export function ctxFor(db: TestDb): AppContext {
  return createTestContext({ db });
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
