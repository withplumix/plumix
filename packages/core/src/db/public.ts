// Direct writes fire no `entry:*`/`term:*` action and so no auto-purge, which
// is why the write helpers and the purge vocabulary share this import.

// Query operators, table-introspection helpers, unique-constraint guards,
// types.
export * from "./index.js";
// CDN tag vocabulary (PRD #1080): build the coarse `t:<type>`/`e:<id>`
// tags core would and enqueue them for the post-request / scheduled flush.
export {
  entryPurgeTags,
  entryTag,
  termPurgeTags,
  typeTag,
} from "../cdn/contract/tags.js";
export { enqueuePurgeTags } from "../cdn/purge.js";
// So a plugin replacing the search page can degrade to core's own query rather
// than restate it.
export { entrySearchCondition } from "./search-conditions.js";
export { tokenizeSearchQuery } from "../search/contract/search-terms.js";
export type { SearchTerm } from "../search/contract/search-terms.js";
// Settling meta is a direct writer's other obligation: a raw write skips the
// field pipeline that stores a value in its declared form (#2433).
export { settleMeta } from "../meta/settle-meta.js";
export type { MetaOwner } from "../meta/settle-meta.js";
// Any table with `updated_at` or `version` opts into guarded writes by
// composing these into its own drizzle update.
export {
  claim,
  claimVersion,
  ConflictError,
  etagOf,
  ifMatchObject,
  mergePatch,
  nextToken,
  parseIfMatch,
  parseVersionIfMatch,
  versionIfMatchObject,
} from "./concurrency.js";
// A term's `version` is its token; a plugin editing a term (a menu) claims it
// the way `term.update` does.
export { assertTermCopyCurrent, claimTerm } from "./term-claim.js";
// Any resource a client edits from a copy opts into edit leases by keying them
// under its own kind and calling `assertWritable` before its claim.
export {
  acquireEditLease,
  assertWritable,
  EDIT_LEASE_DURATION_MS,
  LockedError,
  readEditLease,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
} from "./edit-lease.js";
export type {
  EditLease,
  EditLeaseRenewal,
  LeaseClaimant,
  LeaseHolder,
  LeaseResource,
} from "./edit-lease.js";
export { readVisitorMeta } from "./visitor-meta.js";
export { defineDataMigration } from "./data-migration.js";
export type { DataMigration } from "./data-migration.js";
export type { DataMigrationDb } from "../context/app-context.js";
export type { VisitorMeta, VisitorMetaOptions } from "./visitor-meta.js";
// So a surface can hand a plugin a query already restricted to what it may
// show, with no way to widen it.
export { compileEntryQuery, entryQuery } from "../entries/query.js";
// What a listing may show the request's principal, for a surface reading
// archive entries outside core's listing reader. `anonymousContext(ctx)` asks
// it for every visitor.
export { publicEntryRows } from "../entries/visibility.js";
// Load an entry by id the way core does: a revision or autosave row answers as
// missing, so a plugin taking an id from a visitor cannot reach editor history.
export { loadAuthoredEntry } from "../entries/authored.js";
export type {
  EntryOrderColumn,
  EntryOrderDirection,
  EntryQuery,
} from "../entries/contract/query.js";
