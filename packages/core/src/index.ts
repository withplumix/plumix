// Side-effect: exposes core's `TemplateDepRegistry` augmentation.
import "./template-deps-core.js";
// Side-effect: anchors public core hook augmentations (seo:*, render:document,
// resolve:*, admin_bar:nodes, …) into the published declaration graph (#1698).
import "./hooks/public-hooks.js";

export * from "./access/index.js";
export * from "./admin/index.js";
export * from "./auth/index.js";
export { withBasePath } from "./base-path.js";
export * from "./cli/index.js";
export * from "./config.js";
export * from "./context/index.js";
// The drizzle query operators (`./db/index.js`) and schema tables
// (`./db/schema/index.js`) are deliberately NOT re-exported here. Direct DB
// writes are a specialized concern with a dedicated seam: operators +
// introspection + purge on `@plumix/core/db` (`plumix/db`), tables on
// `@plumix/core/schema` (`plumix/schema`). Surfacing them on the root barrel
// too gave newcomers two ways to import the same thing with no signal about
// which is canonical (#1766). The `traceDbQuery`/`traceDbBatch` helpers below
// aren't part of that direct-write toolkit, so they stay on root.
// Driver-agnostic query-span helpers — runtime adapters (D1, demo) wrap their
// driver's execution path with these so every `ctx.db` query is traced.
export { traceDbBatch, traceDbQuery } from "./db/trace.js";
export type { TracedQuery } from "./db/trace.js";
export * from "./hooks/index.js";
export * from "./i18n/index.js";
export type { JsonObject, JsonValue } from "./json.js";
export * from "./mcp/index.js";
export * from "./plugin/index.js";
export { isCurrentSource } from "./route/current.js";
export type { CurrentSource, ResolvedEntity } from "./route/current.js";
export type { RouteIntent, RouteRule } from "./route/intent.js";
export type {
  RedirectResolution,
  RedirectRule,
  RedirectStatus,
  RedirectTarget,
} from "./route/redirects.js";
export type { ResolvedNode } from "./route/render/rule-resolver.js";
export * from "./rpc/index.js";
export type * from "./runtime/adapter.js";
export { buildApp } from "./runtime/app.js";
export type { PlumixApp } from "./runtime/app.js";
// Dev-only: the generated worker entry references this under its
// `process.env.PLUMIX_DEV` gate to serve the dev error page when app
// construction throws; it tree-shakes out of production builds (#1601).
export { renderDevBootErrorResponse } from "./dev/server/boot.js";
export type * from "./runtime/bindings.js";
export { createPlumixDispatcher } from "./runtime/dispatcher.js";
export type { PlumixDispatcher } from "./runtime/dispatcher.js";
export type { EnvInput } from "./runtime/env-input.js";
export { resolveEnvInput } from "./runtime/env-input.js";
export { forbidden, jsonResponse, methodNotAllowed } from "./runtime/http.js";
export { memoryKv } from "./runtime/memory-kv.js";
export type { MemoryKvConfig } from "./runtime/memory-kv.js";
export { memoryStorage } from "./runtime/memory-storage.js";
export type { MemoryStorageConfig } from "./runtime/memory-storage.js";
export { runScheduledTasks } from "./runtime/scheduled.js";
export type * from "./runtime/slots.js";
export { slugify } from "./slugify.js";
export { buildResolvedEntries } from "./route/render/build-resolved-entries.js";
export { resolveReferences } from "./rpc/meta/core.js";
export type { ResolvedMeta, WithResolvedMeta } from "./rpc/meta/core.js";
export { readEntryType } from "./entries/read-service.js";
export { memoBatch } from "./context/memo.js";
export type { RequestMemo } from "./context/memo.js";
// Edge-cache tag vocabulary (PRD #1080). Exposed so a plugin that writes
// directly to `ctx.db` — bypassing the entry-mutation service, so no
// `entry:*`/`term:*` action fires — can enqueue the same coarse purge core
// would, instead of hand-restating the `t:<type>`/`e:<id>` scheme (#1700).
export {
  entryPurgeTags,
  entryTag,
  termPurgeTags,
  typeTag,
} from "./cache/tags.js";
export { enqueuePurgeTags } from "./cache/purge.js";
// Exposed for plugin routes that own an expensive-to-produce payload — a
// generated social card, a derived image — so each route doesn't restate the
// storage and ETag round-trips (#1958).
export { serveRenderedAsset } from "./cache/rendered-asset.js";
export type { RenderedAssetArgs } from "./cache/rendered-asset.js";
// Exposed for a `cache:` provider: which responses a shared cache may hold is
// framework policy, not the runtime's, and a provider's `put` reads the same
// rule core does when it decides whether to store at all.
export { responseAllowsSharedStorage } from "./cache/decision.js";
export {
  archive,
  author,
  date,
  entry,
  collectNamedTemplates,
  fallback,
  forArchiveType,
  forAuthor,
  forDate,
  forEntryType,
  forTermTaxonomy,
  frontPage,
  NAMED_TEMPLATE_META_KEY,
  notFound,
  search,
  serverError,
  taxonomy,
  templateRules,
} from "./route/render/template-builders.js";
export type { NamedTemplateChoice } from "./route/render/template-builders.js";
// The selection half of the hierarchy, public for the same reason `TierMatchRule`
// and `TargetMatcher` are: a plugin declaring its own rule kind against the node
// hierarchy (the OG plugin's `ogCards`) builds its selectors out of these rather
// than restating core's matchers.
export {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeTargets,
  termTaxonomyTargets,
} from "./route/render/rule-selectors.js";
export type {
  AuthorTargets,
  BindRule,
  DateTargets,
  EntryTypeTargets,
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
export { resolveErrorRule, resolveRule } from "./route/render/rule-resolver.js";
export {
  resolveErrorTemplate,
  resolveTemplate,
} from "./route/render/template-hierarchy.js";
export type {
  ArchiveData,
  AuthorArchiveData,
  CustomArchiveData,
  DateArchiveData,
  EntryData,
  ErrorData,
  FrontPageData,
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  SearchData,
  TaxonomyData,
} from "./route/render/resolved-entry.js";
export { defineTemplate } from "./template.js";
export type {
  Template,
  TemplateDepRegistry,
  TemplateRender,
  TemplateRenderArgs,
} from "./template.js";
export { loadTemplateDeps } from "./template-deps.js";
export type { TemplateDepLoader } from "./template-deps.js";
export {
  defineTheme,
  isArchive,
  isAuthor,
  isCustom,
  isDate,
  isEntry,
  isError,
  isFrontPage,
  isSearch,
  isTaxonomy,
} from "./theme.js";
export type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
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
