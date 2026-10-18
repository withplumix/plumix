import { index, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";

import { users } from "./users.js";

export const EDIT_LEASE_SURFACES = ["admin", "mcp", "rest", "rpc"] as const;
export type EditLeaseSurface = (typeof EDIT_LEASE_SURFACES)[number];

/**
 * One row per leased resource. A row past `expiresAt` is the same as no row,
 * and acquiring over it replaces it, so nothing sweeps them.
 */
export const editLeases = sqliteTable(
  "edit_leases",
  (t) => ({
    /** `entry` today; any table's rows can be leased under a kind of their own. */
    resourceKind: t.text().notNull(),
    /** Text, so a table keyed by text leases the same way as one keyed by id. */
    resourceId: t.text().notNull(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surface: t.text({ enum: EDIT_LEASE_SURFACES }).notNull(),
    /** When the holder acquired it; a renewal keeps it. */
    since: t.integer({ mode: "timestamp_ms" }).notNull(),
    expiresAt: t.integer({ mode: "timestamp_ms" }).notNull(),
  }),
  (table) => [
    primaryKey({ columns: [table.resourceKind, table.resourceId] }),
    // SQLite doesn't index FK columns, so the user cascade would full-scan.
    index("edit_leases_user_id_idx").on(table.userId),
  ],
);
