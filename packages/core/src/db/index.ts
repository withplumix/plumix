export * from "drizzle-orm/sql";
export type { InferInsertModel, InferSelectModel } from "drizzle-orm";
// Table-introspection helpers that live on the `drizzle-orm` root rather than
// its `/sql` subpath. `getTableColumns` is how a bulk upsert derives its
// `onConflictDoUpdate` set without hand-listing columns, so a direct-write /
// ingest plugin needs these to write against `ctx.db` without taking its own
// `drizzle-orm` dependency (which could drift from core's) — #1700.
export { getTableColumns, getTableName, is } from "drizzle-orm";
export {
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
} from "./errors.js";
