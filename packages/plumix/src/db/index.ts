// The one-stop direct-write / ingest surface: drizzle query operators, schema
// tables, table-introspection helpers, and the edge-cache purge vocabulary, so
// a plugin writing to `ctx.db` never takes its own `drizzle-orm` dependency.
export * from "@plumix/core/db";
