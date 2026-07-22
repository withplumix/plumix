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
// Driver-agnostic query-span helpers — runtime adapters (D1, demo) wrap their
// driver's execution path with these so every `ctx.db` query is traced.
export { traceDbBatch, traceDbQuery } from "./db/trace.js";
export type { TracedQuery } from "./db/trace.js";
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
export { readEntryType } from "./entries/read-service.js";
export { memoBatch } from "./context/memo.js";
export type { RequestMemo } from "./context/memo.js";
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
export type {
  ArchiveDataOf,
  ArchiveTypeName,
  ArchiveTypeRegistry,
  EntryProjection,
  EntryTypeName,
  EntryTypeRegistry,
  MetaOf,
  TermMetaOf,
  TermTaxonomyName,
  TermTaxonomyRegistry,
  TermProjection,
} from "./template-registry.js";
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
} from "./theme.js";
export { ThemeError, ThemeRegistrationError } from "./theme-errors.js";
