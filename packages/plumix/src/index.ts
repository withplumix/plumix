// The public surface, named. Core's barrel is where the framework's modules
// meet each other; this is the subset a site, a theme, a plugin or a runtime
// adapter is promised, so renaming anything else in core is not a breaking
// change. `facade-curated.test.ts` holds what is withheld and why, and fails
// when core exports a value nobody has decided about.
//
// Types stay wholesale: a signature published here references core's types, and
// a consumer has no dependency on `@plumix/core` to name them through.
export type * from "@plumix/core";

// Surface the block/pattern augmentation seams on the root `plumix`
// specifier so consumers extend every registry through one module —
// `declare module "plumix"` — rather than reaching into the internal
// `@plumix/blocks` package. Type-only: the block value API stays on the
// `plumix/blocks` subpath.
export type {
  BlockTypeRegistry,
  PatternCategoryRegistry,
} from "@plumix/blocks";

// Config, auth and the site's own wiring. The cookie and identity helpers are
// what a runtime's own authenticator is composed from — Cloudflare Access reads
// the session cookie and resolves an external identity with them.
export {
  apiTokenAuthenticator,
  auth,
  buildSessionCookie,
  canAccessAdmin,
  chainAuthenticators,
  consoleMailer,
  CORE_CAPABILITIES,
  defaultAuthenticator,
  defineConfig,
  ExternalIdentityError,
  github,
  google,
  isSecureRequest,
  normalizeBasePath,
  OAUTH_ERROR_CODES,
  OAUTH_PROVIDER_KEY_PATTERN,
  OAuthError,
  plumix,
  PlumixConfigError,
  POST_TYPE_CAPABILITY_ACTIONS,
  readSessionCookie,
  resolveEnvInput,
  resolveExternalIdentity,
  resolveReturnUrl,
  ROLE_LEVEL,
  roleLevel,
  SESSION_COOKIE_NAME,
  sessionAuthenticator,
  STAFF_MIN_ROLE,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
  withBasePath,
} from "@plumix/core";

// Access policies.
export {
  ACCESS_POLICY_META_KEY,
  AccessError,
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  entitlement,
  entitlementSegment,
  entryAllowsAnonymousAccess,
  grant,
  isBuiltinSegment,
  principalSegment,
  PRIVATE_SEGMENT,
  redirectToLogin,
  resolveAccess,
  rolePolicy,
} from "@plumix/core";

// Themes and the template hierarchy.
export {
  archive,
  archiveTypeTargets,
  author,
  authorTargets,
  buildResolvedEntries,
  date,
  dateTargets,
  defineTemplate,
  defineTheme,
  entry,
  entryTypeMatch,
  entryTypeTargets,
  fallback,
  forArchiveType,
  forAuthor,
  forDate,
  forEntryType,
  forTermTaxonomy,
  frontPage,
  isArchive,
  isAuthor,
  isCustom,
  isDate,
  isEntry,
  isError,
  isFrontPage,
  isSearch,
  isTaxonomy,
  loadTemplateDeps,
  metaEquals,
  notFound,
  pageFacts,
  resolveErrorRule,
  resolveErrorTemplate,
  resolveListingPage,
  resolveRule,
  resolveTemplate,
  ruleLabel,
  search,
  serverError,
  taxonomy,
  termMetaEquals,
  termTaxonomyMatch,
  termTaxonomyTargets,
  ThemeError,
  ThemeRegistrationError,
} from "@plumix/core";

// Plugins: definition, RPC, hooks, the registries they read and the harness
// their own tests assemble an app from.
export {
  authenticated,
  base,
  buildManifest,
  createAppContext,
  createPluginRegistry,
  DEFAULT_HOOK_PRIORITY,
  definePlugin,
  ENTRY_MENU_ICONS,
  escapeLikePattern,
  findEntryMetaField,
  findTermMetaField,
  findUserMetaField,
  HookRegistry,
  installPlugins,
  listEntryMetaFields,
  listTermMetaFields,
  listUserMetaFields,
  McpToolError,
  memoBatch,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
  previewableEntry,
  registerCoreLookupAdapters,
  requireCapability,
  TAXONOMY_MENU_ICONS,
} from "@plumix/core";
// `tryGetContext` serves a component rendered without a context argument, such
// as SEO's breadcrumbs; `requestStore` is kept with it so a test can enter the
// scope that reader looks in.
export { requestStore, tryGetContext } from "@plumix/core";

// Entries, routing, the URL space and what a page says about itself.
export {
  ackEntryChanges,
  adminEntryScope,
  archiveSlugForEntryType,
  buildEntryPermalink,
  buildEntryPermalinks,
  buildTermArchiveUrl,
  buildTermArchiveUrls,
  canonicalUrl,
  dateRange,
  entryGroups,
  entryRoleImage,
  exposesHierarchicalUrls,
  findTermByPath,
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
  getAutosave,
  isCurrentSource,
  loadSettingsGroups,
  loadSiteSettings,
  nonEmpty,
  readEntryChanges,
  readEntryType,
  resolveReferences,
  slugify,
  termTaxonomyBaseSlug,
} from "@plumix/core";

// Serialization, formatting and JSON narrowing.
export {
  escapeHtml,
  formatDate,
  formatNumber,
  formatRelative,
  isJsonArray,
  isJsonObject,
  labelSourceText,
  resolveLabel,
  xmlEscape,
} from "@plumix/core";

// CDN tags and responses.
export {
  enqueuePurgeTags,
  entryPurgeTags,
  entryTag,
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  responseAllowsSharedStorage,
  serveRenderedAsset,
  tagCdnEntry,
  termPurgeTags,
  typeTag,
} from "@plumix/core";

// Runtime adapters.
export {
  buildApp,
  connectScheduledDb,
  createPlumixHandler,
  createScheduledRunGuard,
  CronSyntaxError,
  declaredSchedules,
  isTrustedDevHost,
  memoryKv,
  memoryStorage,
  parseCron,
  renderDevBootErrorResponse,
  runScheduledTasks,
  scheduledLeaseScope,
  scheduledTasksFor,
  traceDbBatch,
  traceDbQuery,
  traceDbQuerySync,
} from "@plumix/core";

// Dev surfaces a plugin contributes panels to.
export {
  DebugKV,
  DebugSection,
  DevErrorEmptyNote,
  DevErrorFacts,
  DevErrorSubhead,
} from "@plumix/core";
