export { withContext } from "./context.js";
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
// `load-catalog` is intentionally NOT re-exported from the public barrel:
// it depends on `node:fs/promises` / `node:path`, which esbuild can't
// resolve in browser/playground builds (plugin admin chunks, themes).
// Server-side consumers import it directly via the deep path. Mirrors
// the [[core-subpath-imports]] root-barrel constraint at the next layer
// down — the i18n surface must stay browser-safe because plumix/i18n
// re-exports from it.
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
