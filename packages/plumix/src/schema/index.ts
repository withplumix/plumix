// Every value of core's schema module, which is what a drizzle client is built
// from: `Db` is typed over exactly that key set (`CoreSchema`), and `plumix
// migrate generate` re-exports this subpath into the schema drizzle-kit diffs,
// so a table left off it would be dropped from the next migration.
export type * from "@plumix/core/schema";

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
} from "@plumix/core/schema";

// The valibot row schemas generated from each table.
export {
  allowedDomainInsertSchema,
  allowedDomainSelectSchema,
  apiTokenInsertSchema,
  apiTokenSelectSchema,
  authTokenInsertSchema,
  authTokenSelectSchema,
  credentialInsertSchema,
  credentialSelectSchema,
  deviceCodeInsertSchema,
  deviceCodeSelectSchema,
  entryInsertSchema,
  entrySelectSchema,
  entryTermInsertSchema,
  entryTermSelectSchema,
  oauthAccountInsertSchema,
  oauthAccountSelectSchema,
  sessionInsertSchema,
  sessionSelectSchema,
  settingInsertSchema,
  settingSelectSchema,
  termInsertSchema,
  termSelectSchema,
  userInsertSchema,
  userSelectSchema,
} from "@plumix/core/schema";
