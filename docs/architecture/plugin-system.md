# Plugin system

A plugin is a descriptor built with `definePlugin` from `plumix/plugin`, or a factory that takes options and returns one. A site lists descriptors in `plugins` in `plumix.config.ts`. At boot, core installs them in array order into one `PluginRegistry` and one `HookRegistry`, and everything else (routing, RPC, REST, MCP, the admin manifest, cron) reads from those two objects. Plugin authors write against this surface; site developers only list and configure plugins. The code lives in `packages/core/src/plugin/` and `packages/core/src/runtime/install-plugins.ts`, and is re-exported through `packages/plumix/src/plugin.ts`.

## At a glance

```mermaid
flowchart TD
  cfg["plumix.config.ts plugins[]"] --> ip["installPlugins"]
  ip --> st["1. state() per descriptor"]
  st --> pr["2. provides(ctx, state)"]
  pr --> se["3. setup(ctx, state)"]
  se --> as["4. afterSetup(ctx, state)"]
  pr -->|extendPluginContext| se
  pr -->|extendAppContext| app["per-request AppContext"]
  se --> reg["PluginRegistry"]
  se --> hk["HookRegistry"]
  as --> reg
  reg --> rt["buildApp: routes, RPC, REST, MCP, cron"]
  reg --> man["buildManifest: admin manifest"]
```

`installPlugins` runs twice per process in a dev or build: once in `buildApp` (`packages/core/src/runtime/app.ts`) and once in the Vite plugin's manifest pass (`packages/plumix/src/vite/manifest.ts`). That is why per-install state comes from `state`, not from a closure.

## Surface

Descriptor fields (`PluginDescriptor` in `packages/core/src/plugin/define.ts`). All public.

| Field                    | What it declares                                                       | Read by                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                     | `^[a-z][a-z0-9_-]*$`, max 64 chars; becomes path segments and RPC keys | `assertValidPluginId`; `installPlugins` rejects duplicates                                              |
| `state`                  | Per-install factory, awaited before any `provides` (ADR 0043)          | `installPlugins`                                                                                        |
| `provides`               | `extendPluginContext`, `extendAppContext`                              | `createPluginProvidesContext`                                                                           |
| `setup`                  | Required. All registrations below                                      | `createPluginSetupContext`                                                                              |
| `afterSetup`             | Registrations derived from other plugins; gets `ctx.plugins`           | `createPluginAfterSetupContext`                                                                         |
| `shortcodes`             | Shortcodes the editor canvas expands too                               | `installPlugins` registers them; `packages/plumix/src/vite/editor-block-modules.ts`                     |
| `mails`                  | Mails declared by name                                                 | `packages/core/src/mail/declared.ts`                                                                    |
| `authMethods`            | Sign-in methods (ADR 0041)                                             | `packages/core/src/auth/declared-methods.ts`; `packages/plumix/src/vite/auth-method-clients-codegen.ts` |
| `schema`, `schemaModule` | Drizzle tables and the module `plumix migrate` reads                   | `runtime/app.ts` merges `schema`; `packages/plumix/src/cli/migrate/owners.ts`                           |
| `dataMigrations`         | Module of ordered data migrations                                      | `packages/plumix/src/cli/migrate/data-modules.ts`                                                       |
| `i18n`                   | Catalog slot (`PLUGIN_I18N_SLOT` for first-party)                      | `buildManifest`; `packages/plumix/src/vite/plugin-catalog-resolve.ts`                                   |
| `adminEntry`             | Admin source, bundled per site                                         | `packages/plumix/src/vite/admin-plugin-bundle.ts`                                                       |
| `adminChunk`, `adminCss` | Pre-built admin JS/CSS ("legacy" in the type's comment)                | `stagePluginChunks` in `packages/plumix/src/vite/index.ts`                                              |
| `adminPeerVersion`       | Admin range the plugin expects                                         | `warnOnPluginAdminMismatch` in `packages/plumix/src/vite/index.ts`                                      |

Contribution kinds. Each `setup` call writes one `PluginRegistry` field (`packages/core/src/plugin/registry.ts`); the consumer is the code that reads that field.

| Kind                                     | Registration API                                                     | Registry field                                     | Consumer                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Filter / action handler                  | `addFilter`, `addAction`                                             | `HookRegistry`                                     | Firing sites, see [hooks.md](./hooks.md)                                        |
| Plugin-prefixed hook                     | `registerFilter`, `registerAction`                                   | `HookRegistry` as `<id>:<name>`                    | Whoever fires that name                                                         |
| Entry type                               | `registerEntryType`                                                  | `entryTypes`                                       | `route/compile.ts`, `route/resolve.ts`, `access/gate.ts`, `buildManifest`       |
| Term taxonomy                            | `registerTermTaxonomy`                                               | `termTaxonomies`                                   | `route/compile.ts`, `terms/read-service.ts`, `buildManifest`                    |
| Entry / term / user meta box             | `registerEntryMetaBox`, `registerTermMetaBox`, `registerUserMetaBox` | `entryMetaBoxes`, `termMetaBoxes`, `userMetaBoxes` | `buildManifest`, `rest/projection.ts`, `plugin/image-roles.ts`                  |
| Capability                               | `registerCapability`                                                 | `capabilities`                                     | `auth/rbac.ts`                                                                  |
| Settings group / page                    | `registerSettingsGroup`, `registerSettingsPage`                      | `settingsGroups`, `settingsPages`                  | `rpc/procedures/settings/*`, `meta/settle-meta.ts`, `buildManifest`             |
| Rewrite rule                             | `registerRewriteRule`                                                | `rewriteRules`                                     | `route/compile.ts`                                                              |
| Redirects                                | `registerRedirects`                                                  | `redirects`                                        | `runtime/app.ts`                                                                |
| Archive type                             | `registerArchiveType`                                                | `archiveTypes`                                     | `route/compile.ts`, `route/archive-entries.ts`, `runtime/dispatcher.ts`         |
| View                                     | `registerView`                                                       | `views`                                            | `route/compile.ts`, `route/resolve.ts`, `runtime/dispatcher.ts`                 |
| RPC router                               | `registerRpcRouter`                                                  | `rpcRouters`                                       | `runtime/app.ts`, mounted at `/_plumix/rpc/<id>/*`                              |
| MCP tool                                 | `registerMcpTool`                                                    | `mcpTools`                                         | `mcp/registry.ts`, see [mcp.md](./mcp.md)                                       |
| Plugin route                             | `registerRoute`                                                      | `rawRoutes`                                        | `runtime/app.ts`, `dev/routes.ts`                                               |
| Public route                             | `registerPublicRoute`                                                | `publicRoutes`                                     | `route/public-routes.ts`, `runtime/app.ts`                                      |
| REST resource                            | `registerRestResource`                                               | `restResources`                                    | `rest/build-handler.ts`, see [rest-api.md](./rest-api.md)                       |
| Admin page, dashboard widget, field type | `registerAdminPage`, `registerDashboardWidget`, `registerFieldType`  | `adminPages`, `dashboardWidgets`, `fieldTypes`     | `buildManifest` only                                                            |
| Block, mark                              | `registerBlock`, `registerBlocks`, `registerMark`                    | `blockSpecs`, `markSpecs`                          | `runtime/app.ts`, `buildManifest`                                               |
| Shortcode                                | `registerShortcode`                                                  | `shortcodeSpecs`                                   | `runtime/app.ts`                                                                |
| Pattern                                  | `registerPattern`                                                    | `patternSpecs`                                     | `buildManifest`                                                                 |
| Lookup adapter                           | `registerLookupAdapter`                                              | `lookupAdapters`                                   | `rpc/procedures/lookup-adapters.ts`, `images/role-images.ts`, `meta/core.ts`    |
| Image role                               | `registerImageRole`                                                  | `imageRoles`                                       | `plugin/image-roles.ts`; indexed by `resolveImageRoleIndex` in `runtime/app.ts` |
| Login link                               | `registerLoginLink`                                                  | `loginLinks`                                       | `rpc/procedures/auth/login-links.ts`                                            |
| Scheduled task                           | `registerScheduledTask`                                              | `scheduledTasks`                                   | `runtime/app.ts`, see [cron.md](./cron.md)                                      |
| Template dep                             | `registerTemplateDep`                                                | `templateDeps`                                     | `template-deps-core.ts`, `rpc/procedures/entry/resolve-block-deps.ts`           |
| Plugin-context helper                    | `provides` → `extendPluginContext`                                   | merged onto every setup ctx                        | Other plugins' `setup`                                                          |
| App-context helper                       | `provides` → `extendAppContext`                                      | `appContextExtensions`                             | Runtime adapters merge onto each `AppContext`                                   |

Paths in the last column are under `packages/core/src/`. Other public exports from `plumix/plugin`: `applyOverride` / `Overridable` (option overrides that merge objects one level and compose arrays), `installPlugins`, `createPluginRegistry`, `buildManifest`, `HookRegistry`, `defineAuthMethod`, `defineMail`.

## How it works

`installPlugins` checks every id, then runs four passes over the array: all `state` factories, all `provides`, all `setup`, all `afterSetup`. Each hook gets the descriptor's own state as its second argument. `provides` runs fully before any `setup`, so a helper from `extendPluginContext` reaches every plugin whatever the order. `afterSetup` sees `ctx.plugins`, live and read-only, holding every `setup` registration and the `afterSetup` registrations of earlier plugins only.

`buildApp` seeds the registry before plugins run (core lookup adapters, template deps, settings, scheduled tasks, and the `featured` and `ogImage` image roles). After install it fires `theme:ready`, then indexes image roles, then merges plugin `schema` exports, rejecting a key two owners export.

- `packages/core/src/plugin/define.ts`: `definePlugin` (object form and older `(id, setup, options)` form), `PluginDescriptor`, `assertValidPluginId`, `PLUGIN_I18N_SLOT`, `pluginAdminEntryPath`.
- `packages/core/src/plugin/setup-context-types.ts`: `PluginSetupContextBase`, `PluginAfterSetupContext`.
- `packages/core/src/plugin/setup-context.ts`: `createPluginSetupContext`; uses `claimKey` for duplicate checks and the validators in `plugin/validation/`.
- `packages/core/src/plugin/provides-context.ts`: `createPluginProvidesContext`, `RESERVED_EXTENSION_KEYS`, `APP_CONTEXT_BASE_KEYS`.
- `packages/core/src/plugin/registry.ts`: `PluginRegistry`, `MutablePluginRegistry`, `createPluginRegistry`, the option types.
- `packages/core/src/plugin/build-manifest.ts`: `buildManifest`, the registry projection the admin reads; see [admin-and-editor.md](./admin-and-editor.md).
- `packages/core/src/plugin/errors.ts`: `PluginDefinitionError`, `PluginContextError`, `DuplicateRegistrationError`.

## Invariants

- Core owns what would be wrong without a plugin; a plugin owns what would only be missing ([ADR 0002](../adr/0002-core-owns-what-would-be-wrong.md)). `registerPublicRoute` exists so a plugin can answer at the site root.
- State comes from `state`, once per install, private to the plugin ([ADR 0043](../adr/0043-a-plugins-per-install-state-comes-from-its-state-factory.md)). Guarded by the state tests in `packages/core/src/runtime/install-plugins.test.ts` and the type tests in `packages/core/src/plugin/define.test.ts`.
- Sign-in methods are declared on the descriptor; a duplicate or reserved name fails boot ([ADR 0041](../adr/0041-a-sign-in-method-is-a-registered-extension.md)).
- `provides` finishes before any `setup`, and an `extendAppContext` key can't shadow a base `AppContext` field or `__proto__`. Guarded by `packages/core/src/plugin/provides.test.ts`.
- Two plugins with the same id, or two owners of one registered name, fail boot (`duplicatePluginIdInConfig`, `DuplicateRegistrationError`). Guarded by `packages/core/src/runtime/install-plugins.test.ts`.
- `setup`, `afterSetup` and `theme:ready` handlers do no IO and are safe to repeat, because the Vite manifest pass reruns them on every config change (comment on `computeManifestAndRegistry` in `packages/plumix/src/vite/manifest.ts`).
- Imports go through `plumix`, never `@plumix/*` (AGENTS.md, the umbrella rule).

## Status

- Shipped: descriptor, four-pass install, state factory, every kind in the table. All eleven plugins in `packages/plugins/` use `definePlugin`; `forms` and `seo` use `state`.
- Shipped: plugin authoring guide at `apps/docs/src/content/docs/plugins/overview.mdx`.
- Open work on the plugin surface: #3260 (settings writes through `ctx.settings.write`), #3263 (lint plugins that write core tables), #3264 (remove the plugin-facing cache tag API), #3246 (publish the editing-copy hook to plugins).

## Gaps

- Two `definePlugin` forms. The function form takes the third argument as `legacyOptions` and can't declare `state`, `provides`, `afterSetup`, `shortcodes`, `mails` or `authMethods`. `packages/plugins/media/src/index.ts` still uses it.
- `adminChunk` is commented as a legacy alternative to `adminEntry`. No first-party plugin sets it; only `packages/plumix/src/vite/` and its tests read it.
- `registerFilter` is documented as "Declare a plugin-owned filter", but it only adds a handler under `<id>:<shortName>`. Nothing declares the name, `shortName` is an untyped `string`, and the only callers are tests (`install-plugins.test.ts`, `provides.test.ts`).
- `definePlugin` warns with `console.warn` when `schema` is set without `schemaModule`, at runtime rather than at the type level.
- Two ADRs share number 0043 (`0043-a-plugins-per-install-state-comes-from-its-state-factory.md`, `0043-a-site-build-ships-the-licences-of-what-it-bundles.md`), and two share 0003. Links by number are ambiguous.
