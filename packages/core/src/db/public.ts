// The `@plumix/core/db` (and `plumix/db`) surface: everything a plugin needs to
// write directly to `ctx.db` and invalidate the edge cache, in one import, so it
// never takes its own `drizzle-orm` dependency. Direct writes bypass core's
// entry-mutation service — no `entry:*`/`term:*` action fires, so no auto-purge
// — hence the write helpers and the purge vocabulary belong together here.
// Everything below is also reachable from the flat `@plumix/core` root barrel;
// this subpath just groups it (#1700).

// Query operators, table-introspection helpers, unique-constraint guards, types.
export * from "./index.js";
// The schema tables the operators run against.
export * from "./schema/index.js";
// Edge-cache tag vocabulary (PRD #1080): build the coarse `t:<type>`/`e:<id>`
// tags core would and enqueue them for the post-request / scheduled flush.
export {
  entryPurgeTags,
  entryTag,
  termPurgeTags,
  typeTag,
} from "../cache/tags.js";
export { enqueuePurgeTags } from "../cache/purge.js";
