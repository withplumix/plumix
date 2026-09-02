export { withContext } from "./context.js";
export { buildLocaleCookie } from "./cookie.js";
export {
  formatDate,
  formatNumber,
  formatRelative,
  type FormatRelativeOptions,
} from "./format.js";
export {
  GENERIC_ENTRY_TYPE_LABELS,
  GENERIC_TERM_TAXONOMY_LABELS,
} from "./generic-type-labels.js";
export { labelSourceText, resolveLabel, type Label } from "./label.js";
// Re-exported for the admin's extraction-mirror lockstep test. The source
// module is runtime-safe (type-only imports), so the browser i18n barrel
// stays clean.
export { SITE_SETTINGS_DESCRIPTORS } from "../settings-core.js";
export { resolveLocales } from "./locale-registry.js";
export type {
  I18nInput,
  LocaleDirection,
  LocaleInput,
  LocaleResolverOverride,
  ResolvedI18n,
  ResolvedLocale,
} from "./locale-registry.js";
export { resolveLocale } from "./resolve-locale.js";
