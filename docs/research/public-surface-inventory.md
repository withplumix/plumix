# The documentable public surface of Plumix

Enumeration only — no decisions. This is the list that the docs tree is checked for coverage
against, and that page briefs cite as their source. Taken from the repository at `plumix@0.14.0`.

Every entry records where it lives. Counts are exact at the time of writing and will drift; the
groupings are the durable part.

> **Corrected 2026-08-23.** Several counts here were taken by sweeping names rather than by reading
> the declaration that owns them, and were wrong in ways the groupings around them were not — the
> lists were right where the totals were not, and in a few places names from an adjacent namespace
> were swept in. Every figure below has now been re-read from source at the same `plumix@0.14.0`
> surface, and the sections that changed say what moved. The seventeen rosters are bound to source
> in `apps/docs/src/content-checks/rosters.ts` (#1860), which is authoritative for a roster's
> membership from here on; this file is the wider enumeration around them. See #1881.

---

## 0. What ships, and what a reader may import

Fourteen packages publish to npm:

| Package | Version | Reader imports it directly? |
| --- | --- | --- |
| `plumix` | 0.14.0 | **Yes — this is the façade.** |
| `create-plumix-app` | 0.3.0 | Yes, via `pnpm create`. |
| `@plumix/runtime-cloudflare` | 0.8.0 | Yes — the runtime slot. |
| `@plumix/plugin-blog` | 0.1.2 | Yes. |
| `@plumix/plugin-pages` | 0.1.0 | Yes. |
| `@plumix/plugin-menu` | 0.1.3 | Yes. |
| `@plumix/plugin-comments` | 0.1.3 | Yes. |
| `@plumix/plugin-media` | 0.5.0 | Yes. |
| `@plumix/plugin-audit-log` | 0.1.1 | Yes. |
| `@plumix/core` | 0.14.0 | **No** — reached through `plumix`. |
| `@plumix/blocks` | 0.14.0 | **No** — reached through `plumix/blocks`. |
| `@plumix/admin` | 0.14.0 | **No.** |
| `@plumix/admin-editor` | 0.14.0 | **No.** |
| `@plumix/admin-ui` | 0.14.0 | **No.** |

**Flag for the docs.** Five packages are published but are not meant to be imported directly —
they are published because the façade's `dist` references them, not because they are API. Nothing
in the package metadata says so; the only statement of intent is prose in
`packages/plumix/src/blocks/index.ts`. Docs will need to say this explicitly, or readers will
`npm install @plumix/core` and import from it, and version-pin against the wrong thing.

Note also the **two version tracks**: the platform packages move in lockstep at `0.14.0`, while the
six plugins are independently versioned from `0.1.0` to `0.5.0`. Any "install this" snippet has to
be right about which track it is on.

---

## 1. Public entry points — 34 subpaths on the `plumix` façade

Source: `packages/plumix/package.json` `exports`, barrels under `packages/plumix/src/`.

**Primary — the surface a site builder or plugin author actually writes against:**

| Subpath | Purpose | Barrel |
| --- | --- | --- |
| `plumix` | Everything from `@plumix/core`, plus the block/pattern type-registry augmentation seams. | `src/index.ts` |
| `plumix/plugin` | Core re-export **plus `valibot` as `v`** — the plugin-author entry. | `src/plugin.ts` |
| `plumix/theme` | `defineTheme`, `defineTemplate`, and the document-manifest types. | `src/theme/index.ts` |
| `plumix/fields` | The fluent meta-box field builders. | `src/fields/index.ts` |
| `plumix/blocks` | `defineBlock`, `renderBlockTree`, `coreBlocks`, `coreMarks`, and the block types. | `src/blocks/index.ts` |
| `plumix/blocks/renderer` | Theme component primitives — `Link`, `Image`. | `src/blocks/renderer.ts` |
| `plumix/db` | Direct-write / ingest toolkit: drizzle operators, introspection, purge vocabulary. | `src/db/index.ts` |
| `plumix/schema` | The drizzle schema tables. | `src/schema/index.ts` |
| `plumix/i18n` | `Label` resolution, formatters, and the Lingui runtime re-exports. | `src/i18n/index.ts` |
| `plumix/vite` | The Vite plugin. | `src/vite/` |

**Testing:** `plumix/test`, `plumix/test/playwright`, `plumix/blocks/test`.

**Runtime internals** a consumer app references but rarely writes by hand — these are wired by the
scaffolder and the Vite plugin: `plumix/blocks/island-runtime`, `plumix/blocks/island-renderer`,
`plumix/core/dev-client`, `plumix/editor-runtime`, `plumix/db/libsql`.

**Admin shared-runtime shims — 15 subpaths**, all under `plumix/admin/*`: `react`,
`react-jsx-runtime`, `react-dom`, `react-dom-client`, `react-query`, `react-router`,
`orpc-client`, `orpc-client-fetch`, `orpc-tanstack-query`, `lingui-core`, `lingui-react`, `radix`,
`sonner`, `tailwind-merge`, `ui`. These exist so plugin admin chunks share the admin's singletons
rather than bundling their own copies; the plugin-chunk bundler rewrites bare specifiers to them.

> **Documentation judgement this enables, not makes:** fifteen of thirty-four subpaths are a
> single mechanism. Whether they are fifteen roster rows or one page about the shared admin
> runtime is a page-brief question, not an inventory one. Bare `plumix/admin` is a sixteenth
> subpath under that prefix and is not one of the shims.

---

## 2. Configuration — 20 top-level options

Source: `packages/core/src/config.ts`, `PlumixConfigInput` (lines 68–163).

**Required (3):** `runtime`, `database`, `auth`.

**Capability slots (6)** — optional, each filled by an adapter: `storage`, `imageDelivery`, `kv`,
`cache`, `mailer`, `theme`. Several carry a documented default: no `cache` means every public page
renders live; no `theme` falls back to the built-in `welcomeTheme`; `consoleMailer()` is the dev
mailer default.

**Composition (3):** `plugins`, `redirects`, `i18n`.

**Feature toggles, all default-off (3):** `mcp` (mounts `/_plumix/mcp`), `api` (mounts
`/_plumix/api/v1/` plus an OpenAPI spec, and carries CORS config), `debugBar` (dev-only, defaults
*on* in dev, accepts `false` or `{ disable: [...] }`).

**Cross-cutting (5):** `basePath`, `telemetry`, `blocks.htmlAllowlist`, `images.remotePatterns`,
`vite`.

Secret-bearing slots resolve through `EnvInput<T>` / `resolveEnvInput`
(`packages/core/src/runtime/env-input.ts`) — a config slot takes `(env) => …` rather than a literal.

---

## 3. Content model

Source: `packages/core/src/db/schema/`, `packages/core/src/plugin/registry.ts`.

**Statuses — 4**, closed set: `draft`, `published`, `scheduled`, `trash`
(`db/schema/entries.ts:8`).

**Entry-type options — 21** on `EntryTypeOptions` (`plugin/registry.ts:119`): `label`, `labels`,
`description`, `supports`, `termTaxonomies`, `isHierarchical`, `isPublic`, `showUI`,
`showInSidebar`, `excludeFromGenericRpc`, `excludeFromSearch`, `hasArchive`, `rewrite.{slug,
isHierarchical}`, `capabilityType`, `capabilities`, `priority`, `menuIcon`, `keywords`,
`versioning.{maxRevisions, autosaveIntervalSeconds}`, `archivePerPage`, `access`.

**Entry-type labels — 28 slots** (`EntryTypeLabels`, `plugin/registry.ts:55`): `singular`, `plural`,
`addNew`, `addNewItem`, `editItem`, `newItem`, `viewItem`, `viewItems`, `searchItems`, `notFound`,
`notFoundInTrash`, `loadingItems`, `loadErrorItems`, `allItems`, `noMatch`, `parentItem`,
`parentItemColon`, `untitledItem`, `moveToTrash`, `itemUpdated`, `itemPublished`,
`itemPublishedPrivately`, `itemScheduled`, `itemTrashed`, `itemRevertedToDraft`, `itemsList`,
`itemsListNavigation`, `filterItemsList`.

**Term taxonomies:** `TermTaxonomyOptions` and `TermTaxonomyLabels`, same shape, fewer slots.

**Supports:** an open `readonly string[]`, not a closed enum. Values seen in core: `title`,
`editor`, `excerpt`, `slug`, `revisions`, `autosave`, `author`. **Flag:** `CONTEXT.md` documents
six; the code accepts any string. The roster ticket will need to decide whether the documented set
is normative.

**Tables — 12:** `allowed_domains`, `api_tokens`, `auth_tokens`, `credentials`, `device_codes`,
`entries`, `entry_term`, `oauth_accounts`, `sessions`, `settings`, `terms`, `users`.

---

## 4. Fields — the roster is already a single source of truth

Source: `packages/core/src/plugin/fields/roster.ts`, exported via `plumix/fields`.

This is the closest existing analogue to the Laravel validation page, and it is **already grouped
by family in code**, with a type-level guard binding the roster to the `MetaBoxField` union so the
two cannot drift.

| Family | Count | Members |
| --- | --- | --- |
| String scalars | 5 | `text`, `textarea`, `email`, `url`, `password` |
| Temporal | 3 | `date`, `datetime`, `time` |
| Scalars | 4 | `number`, `color`, `range`, `json` |
| References | 6 | `user`, `userList`, `entry`, `entryList`, `term`, `termList` |
| Choice | 2 | `select`, `toggle` |
| Structural | 4 | `richtext`, `repeater`, `group`, `link` |
| **Canonical total** | **24** | |
| Legacy — reserved, rendered, not authorable | 3 | `checkbox`, `radio`, `multiselect` |
| Plugin-contributed — in the union, not the roster | 2 | `media`, `mediaList` (from `@plumix/plugin-media`) |

**Builder surface** (`plugin/fields/index.ts`): fluent builders whose chains expose only the
options valid for the underlying renderer — `number(...).maxLength(...)` is a compile error. Named
builders: `text`, `link`/`LinkFieldBuilder`, `number`, `date`/`datetime`/`time`, `color`, `range`,
`json`, `richtext`, `group`, `select` (`.multiple()`, `.appearance()`), `toggle`,
`ReferenceFieldBuilder`, `user`, `entry`, `term`. Plus `isFieldVisible` (conditional display) and
`parseMetaDate`.

**Contribution types** (`plugin/fields/contributions.ts`), 20 exported: `EntryMeta`, `MetaOf`,
`InferFields`, `InferStoredFields`, `ResolvedEntryFor`, `SettingsOf`, `TermMetaOf`, `UserMetaOf`
and their kin — the type-level machinery a plugin author meets when typing meta.

---

## 5. Blocks, marks, shortcodes, islands

Source: `packages/blocks/src/`.

**Core blocks — 18** (`core-blocks.ts`): `rich-text`, `separator`, `code`, `group`, `section`,
`columns`, `column`, `button`, `details`, `video`, `embed`, `html`, `table`, `table-header-row`,
`table-body-row`, `table-header-cell`, `table-cell`, `pattern-ref`.

**`core/html` was unreachable when this was written; it ships registered since #1889.** It sat
outside `coreBlocks` with nothing registering it, and `isReservedBlockName` is
`name.startsWith("core/")`, so both routes in threw on the name — a theme's `blocks` field
(`core/src/theme.ts:269`) and a plugin's `registerBlock` (`core/src/plugin/setup-context.ts:706`).
Recorded because the shape recurs: a block excluded for a reason that later stops holding, with the
opt-in it named closed by an unrelated guard.

**Flag: `config.blocks.htmlAllowlist` reaches no renderer** (#1891). `HtmlAllowlistProvider` is
exported and mounted nowhere, and `app.htmlAllowlist` has no readers, so every block that renders
stored HTML sanitises against the baseline whatever an operator sets. Its fields are also not
uniformly additive: `extraTags`/`extraAttributes` merge, `schemes` and `allowProtocolRelative`
replace. `HARD_DENYLIST` omits the mXSS context-switching tags (#1892).

**Marks — 13** (`marks/core/`): `bold`, `italic`, `underline`, `strike`, `code`, `link`, `abbr`,
`cite`, `highlight`, `kbd`, `small`, `subscript`, `superscript`.

**Hydration — a two-axis roster** (`island-props.ts`, implementations in `island-strategies/`).

*When it hydrates* — `client`, 5 values:

| Strategy | Behaviour |
| --- | --- |
| `load` | Hydrate eagerly on connect. |
| `idle` | Hydrate in a `requestIdleCallback` slot, with a capped fallback. |
| `visible` | Hydrate when the island scrolls into view. |
| `interaction` | Hydrate on first user intent, **then replay the triggering event** so the first click or keypress isn't lost. |
| `only` | No SSR markup; render client-side on connect. |

*When the chunk downloads* — `prefetch`, 3 values: `load`, `idle`, `visible`. `interaction` and
`only` are excluded **at the type layer**, because prefetching "on interaction" would deliver the
chunk after the click it was meant to make instant. Defaults derive from `client`, so an author
only sets `prefetch` to override.

Splitting download-time from hydration-time is a deliberate differentiator, and `interaction`'s
event replay is documented in-source as the headline capability. Both facts want to survive into
the docs rather than being flattened into a five-row list.

**Island authoring:** `IslandProps<T>` reserves the `client` and `prefetch` prop names and
**excludes function-typed props at the type layer** — functions don't survive the SSR→hydration
JSON round-trip, so the type makes the silent drop a compile error.

**Block authoring API** (`plumix/blocks`): `defineBlock`, `createBlockRegistry`,
`renderBlockTree`, `defineEntryContent`, `validateEntryContent`, `resolveBlockTransforms`,
`expandBlockVariations`, `isEntryContent`, `isBlockNodeArray`, `BlockContentValidationError`. Types:
`BlockSpec`, `BlockInput`, `BlockVariation`, `BlockTransforms`, `MarkSpec`, `EntryContent`,
`BlockContext`, `BlockRenderHooks` and ~10 more.

**Styles** (`blocks/src/styles/`): the style-field codec, CSS sanitiser, style emitter, viewport
breakpoints. Style values are plain CSS strings.

**Shortcodes**: `shortcodes/core/` plus the expander.

**Theme component primitives** (`plumix/blocks/renderer`) — more than the two named in
`CONTEXT.md`: `Link` (`LinkProps`, `LinkTarget`), `Image` (`ImageProps`, plus `buildImageAttrs`
and `matchesRemotePattern`), `BlockRenderer`, `PlumixProvider`, the auth-gating pair `SignedIn` /
`SignedOut`, and the `useAuth` hook. The editor bridge (`EDITOR_BRIDGE_CHANNEL`, `Envelope`,
`Handshake`) also lives here but is editor-internal.

---

## 6. Themes and templates

Source: `packages/core/src/theme.ts`, `template.ts`, `route/render/template-builders.ts`.

**Entry points:** `defineTheme`, `defineTemplate`.

**Template builders — 16**, counting `defineTemplate` and the rules that wrap it. Ten generic
tiers (`template-builders.ts`), one per `GenericTier`: `fallback`, `entry`, `archive`, `taxonomy`,
`author`, `date`, `frontPage`, `search`, `notFound`, `serverError`. Five targeted matchers:
`forEntryType`, `forTermTaxonomy`, `forAuthor`, `forDate`, `forArchiveType`.

The same module also exports `templateRules`, `collectNamedTemplates`, `NAMED_TEMPLATE_META_KEY`
and `NamedTemplateChoice`. Those are the resolver's own machinery and a metadata key, not builders
a theme author calls, which is why the earlier count of 19 overshot.

**Template-data guards — 9** (`theme.ts`), one per shape: `isEntry`, `isArchive`, `isTaxonomy`,
`isAuthor`, `isDate`, `isCustom`, `isFrontPage`, `isSearch`, `isError`. `isCurrentSource`
(`route/current.ts`) is a different predicate over a different type and is not one of them.

**Template-data shapes — 9**, the members of the `TemplateData` union (`theme.ts`), declared in
`route/render/resolved-entry.ts`: `EntryData`, `ArchiveData`, `TaxonomyData`, `AuthorArchiveData`,
`DateArchiveData`, `CustomArchiveData`, `FrontPageData`, `SearchData`, `ErrorData`. `Pagination`,
`ResolvedEntry`, `ResolvedTerm` and `ResolvedAuthor` sit in the same file and are the types those
shapes are built from — supporting types, not shapes a template receives.

Guards and shapes pair one-to-one; the earlier 10-and-13 split implied an asymmetry that is not
there.

**Document manifest:** `DocumentManifest`, `DocumentMeta`, `DocumentLink`, `DocumentScript`.

**Typed registries — 9** (`template-registry.ts`): `EntryTypeRegistry`, `EntryTypeName`,
`EntryProjection`, `TermTaxonomyRegistry`, `TermTaxonomyName`, `TermProjection`,
`ArchiveTypeRegistry`, `ArchiveTypeName`, `ArchiveDataOf`.

**Also:** `GenericTier`, `TargetMatcher`, `TemplateRule`, `TemplateDepRegistry`,
`TemplateDepLoader`, `resolveTemplate`, `resolveErrorTemplate`, `ThemeError`,
`ThemeRegistrationError`, and the fallback `welcomeTheme`.

---

## 7. Access and identity

Source: `packages/core/src/auth/`, `packages/core/src/access/`.

**Roles — 5, ordered** (`db/schema/users.ts:5`): `subscriber` → `contributor` → `author` →
`editor` → `admin`. `STAFF_MIN_ROLE` is `contributor`; `subscriber` is the theme-only visitor tier.

**Core capabilities — 17** (`auth/rbac.ts:58`), each mapped to a minimum role:
`entry:post:{read, create, edit_own, publish, edit_any, delete, read_revisions,
restore_revision}`, `user:{list, edit_own, create, edit, promote, delete, manage_tokens}`,
`plugin:manage`, `settings:manage`.

**Derived capability actions:** 8 per entry type (`POST_TYPE_CAPABILITY_ACTIONS`), 5 per taxonomy
(`TERM_TAXONOMY_CAPABILITY_ACTIONS`: `read`, `assign`, `edit`, `delete`, `manage`). Shape is
`<entity>:<typeName>:<action>` for per-type resources and `<entity>:<action>` for entity-level ones.

**Authentication** (`auth/`, ~30 modules): passkeys/WebAuthn (`credentials.ts`), magic link
(`magic-link/`), OAuth (`oauth_accounts`), API tokens (`api-tokens.ts`), device flow
(`device-flow.ts`, `device-flow-routes.ts`), invites (`invite.ts`), email change (`email-change/`),
CSRF (`csrf.ts`), cookies, bearer tokens, the `Authenticator` interface and its dispatcher,
bootstrap, and allowed-domain gating.

**Access policy** (`access/`): `AccessPolicy`, `EntryTypeAccess`, `SelectableAccessPolicy`,
segments, gates, entitlements, challenges, teasers, paywalls (vocabulary in `CONTEXT.md`;
implementation in `access/policy.ts` and `access/gate.ts`).

**Flag:** the `hasSession` contract — public render loads a user only if
`authenticator.hasSession(req)`. Custom authenticators **must** implement it. This is exactly the
kind of contract that is invisible until it breaks, and it needs a documented home.

---

## 8. Extension points

### Plugin contribution registries — 27

Source: `packages/core/src/plugin/registry.ts`, `interface PluginRegistry`. This is the definitive
answer to "what can a plugin add":

`entryTypes`, `termTaxonomies`, `entryMetaBoxes`, `termMetaBoxes`, `userMetaBoxes`, `capabilities`,
`settingsGroups`, `settingsPages`, `rewriteRules`, `redirects`, `archiveTypes`, `rpcRouters`,
`mcpTools`, `rawRoutes`, `restResources`, `loginLinks`, `adminPages`, `dashboardWidgets`,
`fieldTypes`, `blockSpecs`, `markSpecs`, `patternSpecs`, `shortcodeSpecs`, `lookupAdapters`,
`scheduledTasks`, `templateDeps`, `pluginIds`.

Supporting modules: `plugin/define.ts`, `register.ts`, `setup-context.ts` (881 lines),
`manifest-projection.ts` (1,738 lines), `lookup.ts`, `provides-context.ts`, `errors.ts` (883
lines), `validation/`.

### Hooks — 105 names across 17 families

Sources: `declare module "plumix"` blocks throughout `packages/core/src` and
`packages/plugins/*/src`. Split across `FilterRegistry` and `ActionRegistry`
(`core/src/hooks/types.ts`), anchored into the published declaration graph by
`core/src/hooks/public-hooks.ts`.

Enumerating those two interfaces gives **116 names** in the repository. The documentable set is
**105** — 59 filters and 46 actions — after removing two groups that belong elsewhere:

- **8 plugin-owned**, which the plugin's own page documents: `comment:*` (5, `plugin-comments`)
  and `menu:*` (3, `plugin-menu`).
- **3 dev-only**, outside the closure `hooks/public-hooks.ts` anchors, so a plugin author cannot
  type against them either: `debug_bar:panels`, `error_page:panels`, `error_page:hints`.

| Family | Count | Notes |
| --- | --- | --- |
| `rpc:*` | 40 | Filters only — `:input` and `:output` per procedure. |
| `entry:*` | 25 | 2 filters, 23 actions. Each event fires per-type and generic. |
| `user:*` | 10 | Actions: lifecycle plus the auth events. |
| `resolve:*` | 7 | Filters over resolved route data. |
| `term:*` | 4 | Actions. |
| `seo:*` | 3 | Filters. |
| `credential:*` | 3 | Actions. |
| `block:*` | 2 | Filters, around block render. |
| `api_token:*` | 2 | Actions. |
| `device_code:*` | 2 | Actions. |
| `admin_bar:*`, `admin:*`, `blocks:*`, `render:*`, `theme:*`, `session:*`, `settings:*` | 1 each | 7 families, 7 names. |

`rpc:*` is the largest family by far and is mechanical — every procedure gets an `:input` and an
`:output` filter. That regularity is a roster-shaping fact.

**Why the earlier figures were higher.** The first pass swept names by prefix rather than reading
the registries, so it collected names that look like hooks and are not. `plugin:*` is a capability
(`plugin:manage`, `auth/rbac.ts`) and `og:*` are OpenGraph meta properties
(`seo/head-defaults.ts`) — neither appears in a hook registry, and both were counted as families.
`user:*` read 17 because the seven `user:*` capabilities sat alongside the ten `user:*` hooks, and
`term:*` inflated the same way. `entry:*` moved the other way and was undercounted: each entry
event fires twice, once per-type and once generic, and both spellings are names a plugin author
picks between.

**Type augmentation:** every registry is extended through the single specifier
`declare module "plumix"`. Mixing specifiers fractures the augmentation; the rule is
eslint-enforced. Prose exists at `docs/type-augmentation.md` (internal).

### Other extension surfaces

- **RPC** (`core/src/rpc/`) — oRPC routers, procedures, meta resolution.
- **REST** (`core/src/rest/`, 16 modules) — `registerRestResource`, default-deny, envelope,
  projection, CORS, OpenAPI generation, entries and terms resources. Internal prose:
  `docs/rest-api.md`.
- **MCP** (`core/src/mcp/`) — 9 tools: `content_list`, `content_get`, `term_list`, `term_get`,
  `taxonomy_list`, `schema_describe`, `error_list`, `telemetry_requests_list`,
  `telemetry_request_get`. Dev-trust gated (`dev-trust.ts`), default-off.
- **Cron** (`core/src/runtime/scheduled.ts`, `register-core-scheduled-tasks.ts`) — `runScheduledTasks`
  plus core's own tasks: session cleanup and scheduled-entry publishing.
- **Admin pages / dashboard widgets** — registered via manifest; the admin ships precompiled and is
  closed for modification, so extensions arrive as plugin chunks.

---

## 9. Cross-cutting

**Caching** (`core/src/cache/`): `entryTag`, `typeTag`, `entryPurgeTags`, `termPurgeTags`,
`enqueuePurgeTags`. Coarse `t:<type>` / `e:<id>` tag vocabulary; core owns the vocabulary and the
gate, the runtime's `edge()` owns the Cache API and purge.

**SEO** (`core/src/seo/`): canonical URLs and canonical redirects, sitemap plus its cache and
invalidator, feeds and feed routes, `robots.txt`, head defaults, site settings, XML emission.
Filters — three, and these are all of them: `seo:sitemap:urls`, `seo:feed:items` and
`seo:robots-txt`. The head itself is shaped by `render:document`, which is not in this family.
(`seo:meta_tags` and `og:title` were listed here before and are not hooks: the first does not
exist, the second is an OpenGraph property name emitted by `seo/head-defaults.ts`.)

**Telemetry** (`core/src/telemetry-otel.ts`, `context/`): consumers registered in config,
head-sampled per request; `traceDbQuery` / `traceDbBatch` for runtime adapters; `ctx.memo` and
`memoBatch` for principal-invariant request memoisation. Internal prose: `docs/telemetry.md`.

**i18n** (`core/src/i18n/`): `resolveLabel`, `labelSourceText`, `withContext`, `formatDate`,
`formatNumber`, `formatRelative`, the `Label` type, locale resolution from cookie and
`Accept-Language`. **Locales shipped: `en`, `uk`, `ar`, `de`, `zh-CN`.**

**Dev experience** (`core/src/dev/`, `dev-client/`): the Ignition-style dev error page, the client
error overlay, browser-errors-to-terminal forwarding, `installDevClient`,
`renderDevBootErrorResponse`, the debug bar and its `debug_bar:panels` filter. Internal prose:
`docs/dev-errors.md`.

**CLI** (`packages/plumix/src/cli/`): **7 commands** — `migrate`, `doctor` and `i18n` built in
(`BUILT_IN_COMMANDS`, `cli/index.ts`), and `dev`, `build`, `deploy` and `types` contributed by the
runtime adapter (`runtimes/cloudflare/src/commands/index.ts`). **5 global flags**, as `formatHelp`
prints them: `--config`, `--cwd`, `--verbose`, `--help`/`-h`, `--version`/`-v`. `help` is a flag,
not a command. Runtimes extend the command set through `commandsModule` and `runtimeMigrate`, so
the four adapter commands are what Cloudflare contributes rather than a fixed part of the CLI.

**Scaffolder** (`packages/create-plumix-app`): base + addon string assembly; plugins self-describe
through a `plumix.scaffold` key.

**Runtime adapter contract** (`core/src/runtime/adapter.ts`): `RuntimeAdapter` with `name`,
`workerExports`, `commandsModule`; `FetchHandler`, `ScheduledHandler`, `ScheduledEvent`,
`CommandContext`, `CommandDefinition`, `CommandRegistry`. Also `buildApp`, `PlumixApp`,
`createPlumixDispatcher`, `memoryKv`, `memoryStorage`, and the binding/slot types. One
implementation ships: `@plumix/runtime-cloudflare` (D1, R2, KV, Images, edge cache).

---

## 10. Official plugins — six

| Plugin | Contributes |
| --- | --- |
| `plugin-blog` | The `post` entry type; `category` and `tag` taxonomies. Small — 2 source files. |
| `plugin-pages` | The hierarchical `page` entry type rooted at `/`. Smallest — 1 source file. |
| `plugin-menu` | Entry type, taxonomy, RPC. 22 files. Hooks: `menu:tree`, `menu:item`, `menu:saved`. |
| `plugin-comments` | Entry type, RPC, public render via dispatcher. 26 files. Hooks: `comment:created`, `comment:approved`, `comment:moderate`, `comment:spam`, `comment:trashed`. |
| `plugin-media` | Entry type, RPC, **blocks**, and the `media`/`mediaList` field types with their lookup adapters and admin renderers. 26 files. |
| `plugin-audit-log` | RPC and meta boxes only — **no blocks**. 18 files. |

The size spread (1 file to 26) means these do not all warrant equal documentation weight.

---

## 11. Internal prose that exists — source material only

`docs/` is internal. The published site never links to it and never migrates it. Listed here so a
writer knows where the facts already are:

- `docs/adr/0001-one-platform-context.md` — the one-bounded-context decision.
- `docs/telemetry.md`, `docs/rest-api.md`, `docs/type-augmentation.md`, `docs/dev-errors.md`.
- `CONTEXT.md` — the binding glossary. Not a docs source so much as a vocabulary constraint.
- Fifteen package READMEs, including one per plugin.

---

## 12. Stability flags for the versioning ticket

**Genuinely unstable or mid-flight:**

1. **OG image rasterisation** (#1708) — the edge SVG→PNG path is a follow-up; the primitive shipped
   but the rendering half has not.
2. **User-authored patterns** (#874) and **pattern-source export** (#1567) — new surface arriving in
   the pattern area.
3. **Blog post-type option overrides** (#1689) — will change `plugin-blog`'s documented options.
4. **Collaboration posture** (#1561) — undecided; affects the editor.

**Churn, not instability.** The last forty commits are concentrated in `core/src` (182 file
touches) and `admin-editor/src` (46). Most open issues (#1814–#1822) are internal lint and typing
work — `unknown`-elimination rules and JSON-dictionary retyping. These change internals, not the
public surface, and should not gate documentation.

**The real risk is not on the issue tracker.** The package-decomposition direction — splitting
`core` into a kernel plus satellites behind the `plumix` façade — would not change the façade's
*subpaths*, which is precisely why the façade exists. Any page that documents an import as
`@plumix/core/...` rather than `plumix/...` is writing against the unstable half. **Every example
should import from `plumix` and its subpaths, without exception.** That is the single most
durable authoring rule this inventory produces.

**Open set, not closed:** `supports` accepts any string while `CONTEXT.md` documents six values. A
roster page has to state whether the documented list is normative or illustrative.
