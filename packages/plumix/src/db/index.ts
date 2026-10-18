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
  claim,
  ConflictError,
  etagOf,
  ifMatchObject,
  mergePatch,
  nextToken,
  parseIfMatch,
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
  termPurgeTags,
  tokenizeSearchQuery,
  typeTag,
} from "@plumix/core/db";
