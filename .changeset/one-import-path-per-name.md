---
"plumix": minor
---

Gives every public value one import path, picked by who writes against it. The root `plumix` now holds only what `plumix.config.ts` writes: `plumix`, `defineConfig`, `consoleMailer`, `resolveEnvInput` and `PlumixConfigError`. Everything else moved off the root:

- `plumix/theme`: `defineTheme` and `defineTemplate` as before, plus the template builders (`fallback`, `entry`, `archive`, `taxonomy`, `author`, `date`, `frontPage`, `search`, `notFound`, `serverError`, `forEntryType`, `forTermTaxonomy`, `forAuthor`, `forDate`, `forArchiveType`), the `is*` data guards, `ThemeError` and `ThemeRegistrationError`.
- `plumix/plugin`: `definePlugin` and the plugin toolkit, entry and URL helpers (`buildEntryPermalinks`, `canonicalUrl`, `loadSiteSettings`, …), the rule-kind pieces (`entryTypeTargets`, `resolveRule`, `metaEquals`, …), route responses (`jsonResponse`, `forbidden`, …), `tagCdnEntry`, `serveRenderedAsset`, and the dev panel components.
- `plumix/auth` (new): `auth`, `github`, `google`, the authenticators, session-cookie helpers, roles and capabilities, and the access policies (`definePolicy`, `rolePolicy`, `grant`, …).
- `plumix/runtime` (new): `buildApp`, `createPlumixHandler`, the cron and scheduled-task helpers, `traceDbQuery` and its siblings, `memoryKv`, `memoryStorage`, `isTrustedDevHost`, `renderDevBootErrorResponse` and `responseAllowsSharedStorage`.
- `plumix/support` (new, browser-safe): `escapeHtml`, `xmlEscape`, `slugify`, `nonEmpty`, `withBasePath`, `normalizeBasePath`, `escapeLikePattern`, `isJsonObject` and `isJsonArray`.
- `plumix/i18n`: `formatDate`, `formatNumber`, `formatRelative`, `resolveLabel` and `labelSourceText` are only here now.
- `plumix/db`: the CDN purge tags (`entryTag`, `typeTag`, `entryPurgeTags`, `termPurgeTags`, `enqueuePurgeTags`) are only here now, and the tables left it. Import `entries`, `users` and the other tables from `plumix/schema`.

A name on two subpaths is gone from all but one. `plumix/plugin` no longer carries `fallback`, `forArchiveType`, `memoryStorage`, `runScheduledTasks`, `slugify`, `withBasePath` or `escapeLikePattern`, and `plumix/blocks/test` no longer carries `validateContent`, which is `validateEntryContent` on `plumix/blocks`. `PluginRpcRouter` moved from `plumix/admin` to `plumix/plugin`, next to the `registerRpcRouter` it types.

The root still exports every type, and `declare module "plumix"` is still the one augmentation target, so a type import from `plumix` keeps working. Each subpath now exports its own role's types instead of all of them, so `import type { EntryData } from "plumix/theme"` works beside the builders. That narrows three subpaths: `plumix/plugin` no longer re-exports every core type, `plumix/theme` no longer carries `ThemeDescriptor` or `TemplateDepRegistry` (augmentation targets, root only), and `plumix/db` no longer carries the row types (`Entry`, `NewEntry`, `User`, …), which moved to `plumix/schema` with the tables. If a type import from one of these subpaths stops resolving, import it from `plumix` instead.

To upgrade, move each value import to the subpath above. A value imported from the wrong path is a compile error that names it.
