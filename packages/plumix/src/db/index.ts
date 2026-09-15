// The one-stop direct-write / ingest surface: drizzle query operators, schema
// tables, table-introspection helpers, and the CDN purge vocabulary, so
// a plugin writing to `ctx.db` never takes its own `drizzle-orm` dependency.
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

// Introspection, bulk-write limits and write-result helpers.
export {
  chunkForD1,
  D1_MAX_BOUND_PARAMETERS,
  getTableColumns,
  getTableName,
  is,
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
  rowsAffected,
} from "@plumix/core/db";

// The tables, and the vocabularies their columns store.
export {
  allowedDomains,
  apiTokens,
  AUTH_TOKEN_TYPES,
  authTokens,
  CREDENTIAL_DEVICE_TYPES,
  credentials,
  DEVICE_CODE_STATUSES,
  deviceCodes,
  entries,
  ENTRY_CHANGE_KINDS,
  ENTRY_STATUSES,
  entryChanges,
  entryTerm,
  oauthAccounts,
  scheduledTaskClaims,
  scheduledTaskLeases,
  sessions,
  settings,
  terms,
  USER_ROLES,
  users,
} from "@plumix/core/db";

// Purge vocabulary, core's search conditions and visitor metadata.
export {
  entryPurgeTags,
  entrySearchCondition,
  entryTag,
  enqueuePurgeTags,
  readVisitorMeta,
  termPurgeTags,
  tokenizeSearchQuery,
  typeTag,
} from "@plumix/core/db";
