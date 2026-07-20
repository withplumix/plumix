// Side-effect: exposes core's `TemplateDepRegistry` augmentation.
import "./template-deps-core.js";

export * from "./admin/index.js";
export * from "./auth/index.js";
export { withBasePath } from "./base-path.js";
export * from "./cli/index.js";
export * from "./config.js";
export * from "./context/index.js";
export * from "./db/index.js";
export * from "./db/schema/index.js";
// Dev-only debug bar's query logger — exposed for runtime adapters (D1) to
// wire into their `drizzle(...)` call behind the `PLUMIX_DEV` gate.
export { createDebugSqlLogger } from "./debug-bar/db-query.js";
export * from "./hooks/index.js";
export * from "./i18n/index.js";
export * from "./mcp/index.js";
export * from "./plugin/index.js";
export { isCurrentSource } from "./route/current.js";
export type { CurrentSource, ResolvedEntity } from "./route/current.js";
export type { RouteIntent, RouteRule } from "./route/intent.js";
export type { ResolvedNode } from "./route/render/template-hierarchy.js";
export * from "./rpc/index.js";
export type * from "./runtime/adapter.js";
export { buildApp } from "./runtime/app.js";
export type { PlumixApp } from "./runtime/app.js";
export type * from "./runtime/bindings.js";
export { createPlumixDispatcher } from "./runtime/dispatcher.js";
export type { PlumixDispatcher } from "./runtime/dispatcher.js";
export type { EnvInput } from "./runtime/env-input.js";
export { resolveEnvInput } from "./runtime/env-input.js";
export { forbidden, jsonResponse, methodNotAllowed } from "./runtime/http.js";
export { memoryStorage } from "./runtime/memory-storage.js";
export type { MemoryStorageConfig } from "./runtime/memory-storage.js";
export { runScheduledTasks } from "./runtime/scheduled.js";
export type * from "./runtime/slots.js";
export { slugify } from "./slugify.js";
export { buildResolvedEntries } from "./route/render/build-resolved-entries.js";
export {
  archive,
  entry,
  fallback,
  forEntryType,
  forTaxonomy,
  frontPage,
  NAMED_TEMPLATE_META_KEY,
  notFound,
  postsPage,
  search,
  serverError,
  taxonomy,
  templateRules,
} from "./route/render/template-builders.js";
export type {
  EntryProjection,
  EntryTypeName,
  EntryTypeRegistry,
  MetaOf,
  TaxonomyName,
  TaxonomyRegistry,
  TermProjection,
} from "./template-registry.js";
export {
  resolveErrorTemplate,
  resolveTemplate,
} from "./route/render/template-hierarchy.js";
export type {
  ArchiveData,
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
export type { TemplateDepLoader } from "./template-deps.js";
export {
  defineTheme,
  isArchive,
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
} from "./theme.js";
export { ThemeError, ThemeRegistrationError } from "./theme-errors.js";
