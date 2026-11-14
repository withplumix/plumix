export type * from "@plumix/core/db";

// Query operators and the `sql` template, from `drizzle-orm/sql`.
export {
  and,
  asc,
  avg,
  avgDistinct,
  between,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notBetween,
  notExists,
  notInArray,
  notLike,
  or,
  sql,
  SQL,
  sum,
  sumDistinct,
} from "@plumix/core/db";

// Table, constraint and column builders for a site's own SQLite tables.
export {
  blob,
  check,
  // typescript-eslint's no-deprecated flags the binding when only one overload,
  // drizzle's legacy variadic form, is deprecated.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  foreignKey,
  index,
  integer,
  numeric,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- as `foreignKey`
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "@plumix/core/db";

// Introspection, bulk-write limits, write-result helpers and data migrations.
export {
  chunkForD1,
  D1_MAX_BOUND_PARAMETERS,
  defineDataMigration,
  getTableColumns,
  getTableName,
  is,
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
  rowsAffected,
} from "@plumix/core/db";

export {
  acquireEditLease,
  assertTermCopyCurrent,
  assertWritable,
  claim,
  claimTerm,
  claimVersion,
  ConflictError,
  EDIT_LEASE_DURATION_MS,
  etagOf,
  ifMatchObject,
  LockedError,
  mergePatch,
  nextToken,
  parseIfMatch,
  parseVersionIfMatch,
  readEditLease,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
  versionIfMatchObject,
} from "@plumix/core/db";

// Purge vocabulary, meta settling, core's search conditions, visitor metadata,
// and the entry query — a query that narrows is built with the same operators
// everything else on this path uses.
export {
  compileEntryQuery,
  entryPurgeTags,
  entryQuery,
  entrySearchCondition,
  entryTag,
  enqueuePurgeTags,
  loadAuthoredEntry,
  publicEntryRows,
  readVisitorMeta,
  settleMeta,
  taxonomyTermRows,
  termPurgeTags,
  tokenizeSearchQuery,
  typeTag,
} from "@plumix/core/db";
