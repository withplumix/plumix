// The `@plumix/core/db` (and `plumix/db`) surface: everything a plugin needs to
// write directly to `ctx.db` and invalidate the CDN, in one import, so it
// never takes its own `drizzle-orm` dependency. Direct writes bypass core's
// entry-mutation service — no `entry:*`/`term:*` action fires, so no auto-purge
// — hence the write helpers and the purge vocabulary belong together here.
// The tables these run against live on `@plumix/core/schema` / `plumix/schema`
// alone, so a table has one import path (#2493). None of it is re-exported
// from the flat `@plumix/core` / `plumix` root barrel anymore (#1766).

// Query operators, table-introspection helpers, unique-constraint guards, types.
export * from "./index.js";
// CDN tag vocabulary (PRD #1080): build the coarse `t:<type>`/`e:<id>`
// tags core would and enqueue them for the post-request / scheduled flush.
export {
  entryPurgeTags,
  entryTag,
  termPurgeTags,
  typeTag,
} from "../cdn/tags.js";
export { enqueuePurgeTags } from "../cdn/purge.js";
// What core's own entry search means — how a query parses, and what matching
// title and excerpt with `LIKE` involves — so a plugin that replaces the search
// page can degrade to core's own query rather than restate it and disagree
// about the details (#2127).
export { entrySearchCondition } from "../search/conditions.js";
export { tokenizeSearchQuery } from "../rpc/procedures/entry/search-terms.js";
export type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
// Settling meta is a direct writer's other obligation: a raw write skips the
// field pipeline that stores a value in its declared form (#2433).
export { settleMeta } from "./settle-meta.js";
export type { MetaOwner } from "./settle-meta.js";
export { readVisitorMeta } from "./visitor-meta.js";
export type { VisitorMeta, VisitorMetaOptions } from "./visitor-meta.js";
// A description of a set of entries that composes by narrowing, built from the
// same operators as the search conditions above, so a surface can hand a plugin
// a query already restricted to what it may show and the plugin has no way to
// widen it (#2487).
export { compileEntryQuery, entryQuery } from "../entries/query.js";
export type { EntryQuery } from "../entries/query.js";
