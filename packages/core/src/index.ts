// Side-effect: exposes core's `TemplateDepRegistry` augmentation.
import "./template-deps-core.js";
// Side-effect: anchors public core hook augmentations (seo:*, render:document,
// resolve:*, admin_bar:nodes, …) into the published declaration graph (#1698).
import "./hooks/public-hooks.js";
// Side-effect: anchors core's `MailRegistry` entries (`magicLink`,
// `emailChange`) into the published declaration graph, the same way.
import "./mail/core-mails.js";

export * from "./access/index.js";
export * from "./admin/index.js";
export * from "./auth/index.js";
export { normalizeBasePath, withBasePath } from "./base-path.js";
export * from "./cli/index.js";
export * from "./config.js";
export { defineConfig, plumix } from "./runtime/define-config.js";
export * from "./context/index.js";
export { consoleLogger, createAppContext } from "./context/app.js";
export type { CreateAppContextArgs } from "./context/app.js";
export { withUser } from "./auth/with-user.js";
// Drizzle operators and schema tables live on `plumix/db` and `plumix/schema`
// only, so direct writes have one canonical import. The trace helpers are for
// runtime adapters, not direct writes.
export { traceDbBatch, traceDbQuery, traceDbQuerySync } from "./db/trace.js";
export type { TracedQuery } from "./db/trace.js";
export * from "./hooks/index.js";
export * from "./i18n/index.js";
export type { JsonObject, JsonValue } from "./json.js";
// Stored meta, telemetry records and block props are `JsonValue` until
// narrowed.
export { isJsonArray, isJsonObject } from "./json.js";
export { defineMail } from "./mail/contract/define.js";
export { MailerNotConfigured } from "./mail/contract/errors.js";
export type {
  AnyMailDefinition,
  MailConfig,
  MailDefinition,
  MailName,
  MailOverride,
  MailOverrides,
  MailParts,
  MailRecipient,
  MailRegistry,
  MailRender,
  MailRenderContext,
  MailSender,
  MailSendOptions,
} from "./mail/contract/registry.js";
export type {
  EmailChangeMailProps,
  MagicLinkMailProps,
} from "./mail/core-mails.js";
export * from "./mcp/index.js";
export * from "./plugin/index.js";
export {
  createPluginAfterSetupContext,
  createPluginSetupContext,
} from "./plugin/setup-context.js";
export * from "./runtime/install-plugins.js";
export { resolveReturnUrl } from "./return-url.js";
export type { ResolveReturnUrlOptions } from "./return-url.js";
export { isCurrentSource } from "./route/current.js";
export type { CurrentSource, ResolvedEntity } from "./route/current.js";
export type { ResolvedRoute } from "./route/match.js";
export type { RouteIntent, RouteRule } from "./route/contract/intent.js";
export type {
  RedirectRule,
  RedirectStatus,
  RedirectTarget,
} from "./route/contract/redirects.js";
export type { RedirectResolution } from "./route/redirects.js";
export type { ResolvedNode } from "./route/render/rule-resolver.js";
export * from "./rpc/index.js";
export type * from "./context/runtime-adapter.js";
export { listAdminAreas } from "./admin-area/i18n.js";
export { buildApp } from "./runtime/app.js";
export type { PlumixApp } from "./runtime/app.js";
// Dev-only: the generated worker entry references this under its
// `process.env.PLUMIX_DEV` gate to serve the dev error page when app
// construction throws; it tree-shakes out of production builds (#1601).
export { renderDevBootErrorResponse } from "./dev/server/boot.js";
export type * from "./runtime/contract/bindings.js";
export { createPlumixDispatcher } from "./runtime/dispatcher.js";
export type { PlumixDispatcher } from "./runtime/dispatcher.js";
export type { EnvInput } from "./runtime/contract/env-input.js";
export { resolveEnvInput } from "./runtime/contract/env-input.js";
export { DRAIN_DEADLINE_MS } from "./runtime/drain.js";
export {
  createPlumixHandler,
  createRuntimeHandler,
} from "./runtime/handler.js";
export type { PlumixHandlerOptions } from "./runtime/handler.js";
// `notFound` is already the template-rule builder's name on this surface, so
// the refusal that answers a request is published under the longer one.
export {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound as notFoundResponse,
} from "./runtime/contract/http.js";
export { memoryKv } from "./runtime/memory-kv.js";
export type { MemoryKV, MemoryKvConfig } from "./runtime/memory-kv.js";
export { memoryStorage } from "./runtime/memory-storage.js";
export type {
  MemoryObjectStorage,
  MemoryStorageConfig,
} from "./runtime/memory-storage.js";
export {
  clampQuality,
  etagMatches,
  fetchRemoteImageSource,
  IMAGE_ROUTE,
  IMAGE_SOURCE_HEADERS,
  imageSourceKey,
  imageTransformUrl,
  isPermittedImageSource,
  isSameHostImageSource,
  negotiateImageFormat,
  parseImageParams,
  readImageSource,
  snapWidth,
} from "./runtime/image-rules.js";
export type {
  ImageFit,
  ImageFormat,
  ImageParams,
  ImageSourceResult,
  ImageUrlRules,
  NegotiatedFormat,
  RemoteImageSourceOptions,
} from "./runtime/image-rules.js";
export { resolveAssetPath } from "./runtime/asset-path.js";
export type { AssetPath } from "./runtime/asset-path.js";
export { trustRequest } from "./runtime/request-trust.js";
export type {
  Connection,
  RequestTrustOptions,
  TrustedRequest,
} from "./runtime/request-trust.js";
export { runScheduledTasks } from "./runtime/scheduled.js";
export {
  declaredSchedules,
  scheduledTasksFor,
} from "./runtime/contract/schedules.js";
export type { CronSchedule } from "./runtime/contract/cron.js";
export { CronSyntaxError, parseCron } from "./runtime/contract/cron.js";
export type {
  ConnectedScheduledDb,
  ScheduledRunGuard,
  ScheduledRunGuardOptions,
  ScheduledRunOutcome,
} from "./runtime/scheduled-guard.js";
export {
  connectScheduledDb,
  createScheduledRunGuard,
  scheduledLeaseScope,
} from "./runtime/scheduled-guard.js";
export { startScheduledRunner } from "./runtime/scheduled-runner.js";
export type { ScheduledRunnerOptions } from "./runtime/scheduled-runner.js";
export type {
  Scheduler,
  SchedulerClock,
  SchedulerLogger,
} from "./runtime/scheduler.js";
export type * from "./runtime/contract/slots.js";
export { slugify } from "./slugify.js";
// For a plugin serving something about a page it did not route to, such as a
// social card at its own URL.
export { resolveEntryList } from "./route/render/resolve-entry-list.js";
export {
  resolveEntryData,
  resolveListingPage,
} from "./route/render/page-data.js";
export type {
  ListingPageTarget,
  ResolvedListingPage,
} from "./route/render/page-data.js";
export { resolveReferences } from "./meta/core.js";
export type {
  ResolvedMeta,
  StoredMeta,
  WithResolvedMeta,
} from "./meta/contract/bags.js";
export { readEntryType } from "./entries/read-service.js";
// A capability named by the resource it guards (#2436): the registry spells
// the string, so a pooled type's namespace is never written by hand.
export {
  entryCapability,
  resolveCapability,
  termCapability,
} from "./access/contract/capability.js";
export type {
  Capability,
  CapabilityNamespaces,
  EntryCapability,
  TermCapability,
} from "./access/contract/capability.js";
// The entry edit gate (#2416), so a plugin asks whether a caller may edit a
// row instead of assembling an `entry:<type>:*` string and missing the
// namespace a pooled type gates under.
export {
  assertCanDeleteEntry,
  assertCanEditEntry,
  canDeleteEntry,
  canEditEntry,
} from "./entries/editability.js";
export type { EntryEditErrors } from "./entries/editability.js";
// The entry change feed (#2121): read a bounded batch, do the work, then
// acknowledge it.
export { ackEntryChanges, readEntryChanges } from "./entries/change-feed.js";
export type { EntryChange } from "./entries/change-feed.js";
export type { EntryChangeKind } from "./db/schema/entry_changes.js";
export { memoBatch } from "./context/memo.js";
export type { RequestMemo } from "./context/memo.js";
// For a plugin writing straight to `ctx.db`, which fires no `entry:*` action,
// to enqueue the purge core would without restating the tag scheme.
export {
  entryPurgeTags,
  entryTag,
  termPurgeTags,
  typeTag,
} from "./cdn/contract/tags.js";
export { enqueuePurgeTags } from "./cdn/purge.js";
// A raw `cacheable: true` route has no resolved intent, so it names its own
// tags and the publish purge clears it with the page.
export { tagCdnEntry } from "./cdn/route-tags.js";
// Exposed for plugin routes that own an expensive-to-produce payload — a
// generated social card, a derived image — so each route doesn't restate the
// storage and ETag round-trips (#1958).
export { serveRenderedAsset } from "./storage/rendered-asset.js";
export type { RenderedAssetArgs } from "./storage/rendered-asset.js";
// So a plugin naming the page (`og:url`, a sitemap `<loc>`) cannot disagree
// with where core sends traffic.
export { canonicalUrl } from "./seo/canonical.js";
// The social image an entry's role-tagged field resolves to, for the plugin
// that owns the chain the roles feed.
export type { OgImage } from "./seo/og-image.js";
// `images.<role>` — the shape every resolved entity carries it in, and the
// options the REST projection narrows it with.
export type { ProjectImageRolesOptions } from "./images/role-images.js";
export type { RoleImages } from "./images/contract/role-images.js";
// The Vite plugin's dev middlewares answer ahead of the worker proxy, so they
// apply the host check themselves; only `configureServer` calls it.
export { isTrustedDevHost } from "./dev/trust.js";
export { DebugKV, DebugSection } from "./dev/debug-panels/primitives.js";
export type { DebugKVRow } from "./dev/debug-panels/primitives.js";
export type { DebugPanel } from "./dev/debug-panels/types.js";
// `DebugPanelId` stays internal: it is `keyof DebugPanelRegistry`.
export type {
  DebugPanelRegistry,
  DebugPanelsInput,
} from "./context/dev-runtime.js";
export type {
  DebugBarInput,
  NormalizedDebugBar,
} from "./context/dev-runtime.js";
// `config.dev` resolved: what `PlumixApp.dev` and `AppContext.dev` hold.
export type { DevRuntime } from "./runtime/dev.js";
// Named by `DevRuntime.history` and `DevInput.history`, so a consumer
// annotating either can spell the type.
export type {
  DebugHistoryStore,
  DebugHistoryStoreOptions,
} from "./context/dev-runtime.js";
export type { DebugSnapshot } from "./dev/request-history/snapshot.js";
// The dev error page's equivalents, for `error_page:hints` and
// `error_page:panels`: the contribution shapes and the pieces a panel body is
// built from.
export type { DevErrorPanel } from "./dev/server/panels/types.js";
export type {
  DevErrorFact,
  DevErrorHint,
  DevErrorHintDoc,
} from "./dev/ui/contract.js";
export {
  DevErrorEmptyNote,
  DevErrorFacts,
  DevErrorSubhead,
} from "./dev/ui/panel-primitives.js";
// `projectImageRoles` reads a hydrated bag; `resolveImageRoles` batches raw
// stored bags.
export { projectImageRoles, resolveImageRoles } from "./images/role-images.js";
// Both memoize per request alongside the template dep reading the same rows,
// so a plugin joins that read instead of opening a second query.
export { loadSettingsGroups, loadSiteSettings } from "./seo/site-settings.js";
export { nonEmpty } from "./non-empty.js";
// XML element-text escaping, for a plugin serializing a feed or a sitemap.
// Core's own serializers use it; exported so two plugins don't each ship the
// same five-character table.
export { xmlEscape } from "./seo/contract/xml.js";
// FTS5 splices highlight markers without escaping around them. Safe for
// element children, not attribute values: quotes are left alone.
export { escapeHtml } from "./escape-html.js";
// A feed or sitemap spelling these itself would drift from the pages the first
// time a rewrite option moved one.
export { dateRange } from "./entries/date-range.js";
export {
  archiveRoutes,
  archiveSlugForEntryType,
  exposesHierarchicalUrls,
  // So a plugin replacing the search page claims exactly the URL space core
  // compiled.
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
  // So a plugin archive's later pages take the shape core's listings use.
  FRAMEWORK_PAGINATION_SUFFIX,
} from "./route/compile.js";
// So a feed reads the same entries the archive page does.
export { archiveAtPath, archiveBaseRoutes } from "./route/archive-entries.js";
// For a plugin advertising a URL, to know no other route answers it first.
export { publicRouteAt } from "./route/public-routes.js";
export type { PublicRouteMatch } from "./route/public-routes.js";
export type {
  ArchiveAtPath,
  ArchiveBaseRoute,
  ArchiveReader,
  EntryArchive,
} from "./route/archive-entries.js";
export {
  buildEntryPermalink,
  buildEntryPermalinks,
  buildTermArchiveUrl,
  buildTermArchiveUrls,
  termTaxonomyBaseSlug,
} from "./route/permalink.js";
// A plugin ranking entries supplies only the query, so "who may see which
// draft" and group naming each keep one definition.
export { adminEntryScope, entryGroups } from "./search/admin-entry-scope.js";
export type {
  AdminEntryGroup,
  AdminEntryScope,
  MatchedEntry,
} from "./search/admin-entry-scope.js";
export type {
  AdminSearchInput,
  SearchGroup,
  SearchResultItem,
} from "./search/admin-search.js";
// Reading the live row alone shows a published entry's pre-edit state.
export { getAutosave } from "./revisions/repository.js";
export type { AutosavePairInput } from "./revisions/repository.js";
// Which responses a shared cache may hold is framework policy, so a provider's
// `put` reads core's rule.
export { responseAllowsSharedStorage } from "./cdn/decision.js";
export {
  author,
  date,
  entry,
  entryType,
  collectNamedTemplates,
  fallback,
  forArchiveType,
  forAuthor,
  forDate,
  forEntryType,
  forTermTaxonomy,
  forView,
  frontPage,
  NAMED_TEMPLATE_META_KEY,
  notFound,
  search,
  serverError,
  term,
  templateRules,
} from "./route/render/template-builders.js";
export type { NamedTemplateChoice } from "./route/contract/named-template.js";
// A plugin declaring its own rule kind (the OG plugin's `ogCards`) builds
// selectors from these rather than restating core's matchers.
export {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeMatch,
  entryTypeTargets,
  metaEquals,
  termMetaEquals,
  termTaxonomyMatch,
  termTaxonomyTargets,
  viewTargets,
} from "./route/render/rule-selectors.js";
export type {
  AuthorTargets,
  BindRule,
  DateTargets,
  EntryTypeTargets,
  MatchNarrowing,
  TermTaxonomyTargets,
} from "./route/render/rule-selectors.js";
export type {
  ArchiveDataOf,
  ArchiveTypeName,
  ArchiveTypeRegistry,
  EntryProjection,
  EntryTypeName,
  EntryTypeRegistry,
  TermTaxonomyName,
  TermTaxonomyRegistry,
  TermProjection,
  ViewDataOf,
  ViewRegistry,
  ViewResolvedDataOf,
} from "./template-registry.js";
export type {
  EntryMeta,
  EntryMetaContributions,
  InferFields,
  InferStoredFields,
  MetaOf,
  ResolvedEntryFor,
  ResolvedTermFor,
  SettingsContributions,
  SettingsMeta,
  SettingsOf,
  StoredMetaOf,
  StoredTermMetaOf,
  TermMeta,
  TermMetaContributions,
  TermMetaOf,
  UserMeta,
  UserMetaContributions,
  UserMetaOf,
} from "./plugin/fields/contributions.js";
export {
  resolveErrorRule,
  resolveRule,
  ruleLabel,
} from "./route/render/rule-resolver.js";
export {
  resolveErrorTemplate,
  resolveTemplate,
} from "./route/render/template-hierarchy.js";
// A plugin reads core's answer rather than walking the payload union itself.
export { pageFacts } from "./route/render/page-facts.js";
export type { PageFacts } from "./route/render/page-facts.js";
export type {
  ArchiveTypeData,
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  ErrorData,
  FrontPageData,
  ListingArchiveData,
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  SearchData,
  TermArchiveData,
  ViewData,
} from "./route/contract/resolved-entry.js";
// One page of an archive's entries, as a listed archive's resolver receives it.
export type { EntryListing } from "./route/contract/entry-listing.js";
export { defineTemplate } from "./template.js";
export type {
  Template,
  TemplateDepKey,
  TemplateDepRegistry,
  TemplateRender,
  TemplateRenderArgs,
} from "./template.js";
export { loadTemplateDeps } from "./template-deps.js";
export type { TemplateDepLoader } from "./template-deps.js";
export {
  defineTheme,
  isArchiveType,
  isAuthor,
  isDate,
  isEntry,
  isEntryType,
  isError,
  isFrontPage,
  isSearch,
  isTerm,
  isView,
} from "./theme.js";
export type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
} from "./document-manifest.js";
export type {
  GenericTier,
  TargetMatcher,
  TemplateComponent,
  TemplateData,
  TemplateEntry,
  TemplateRule,
  ThemeDescriptor,
  TierMatchRule,
} from "./theme.js";
export { ThemeError, ThemeRegistrationError } from "./theme-errors.js";
export type { ViewTransitionsInput } from "./theme-view-transitions.js";
export { transitionName, viewTransitionTypes } from "./view-transition.js";
export type { ViewTransitionType } from "./view-transition.js";
