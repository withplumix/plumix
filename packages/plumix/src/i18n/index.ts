// Macros (`t`, `plural`, `select`) land with the extractor in #675.
// Subpath import — the root `@plumix/core` barrel drags `context/stores.js`
// (`AsyncLocalStorage` from `node:async_hooks`) into the browser bundle,
// which esbuild can't resolve at admin/playground build time. See
// [[core-subpath-imports]].
export {
  formatDate,
  formatNumber,
  formatRelative,
  labelSourceText,
  resolveLabel,
  withContext,
  type FormatRelativeOptions,
  type Label,
} from "@plumix/core/i18n";
// `@lingui/*` re-exports are bare specifiers — the plugin-chunk
// bundler rewrites them to `plumix/admin/lingui-*` via
// `SHARED_ADMIN_RUNTIME_SPECIFIERS` so plugin chunks share admin's
// i18n singleton + provider. Admin/server import the real packages.
export { i18n, type MessageDescriptor } from "@lingui/core";
export { I18nProvider, Trans, useLingui } from "@lingui/react";
