# @plumix/admin

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

## 0.6.0

### Patch Changes

- [#1526](https://github.com/withplumix/plumix/pull/1526) [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields now store plain ids (or id arrays) — the write-time snapshot machinery is gone: the object value-shape (`ReferenceTarget.valueShape`), the adapter cached-fields seam (`LookupResult.cached`), and the write-time cached-reference rewrite are all removed. Values stored under the old `{ id, ... }` shape self-heal transparently: reads yield the id, and the entity's next save persists the plain form. `LookupResult` gains a first-class `href` (entry permalink / term archive) that menu resolution reads directly. The media `media()` / `mediaList()` builders drop the `MediaValue` type (`default` is now an id / id array), and the admin media pickers resolve labels through the batched lookup path instead of stored snapshots.

## 0.5.0

### Minor Changes

- [#1477](https://github.com/withplumix/plumix/pull/1477) [`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5) Thanks [@nasyrov](https://github.com/nasyrov)! - Let users edit their author slug from the admin profile / user-edit screen. The `users.slug` behind `/authors/{slug}` was auto-derived and immutable; `user.update` now accepts a `slug` field, validated with the shared `slugSchema`.

  Unlike the auto-dedup used at creation, an explicit edit surfaces a collision as `CONFLICT { reason: "slug_taken" }` (mirroring the entry-create flow) rather than silently appending a numeric suffix. Any user can edit their own slug (`user:edit_own`); admins can edit anyone's (`user:edit`). The user-edit form gains an "Author slug" field with copy warning that changing it breaks existing `/authors/` links.

- [#1479](https://github.com/withplumix/plumix/pull/1479) [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an entry-editor template picker for theme-registered `named` templates. A theme exposes author-selectable templates via `forEntryType("page").named("landing", "Landing Page").template(...)` (shipped in [#1445](https://github.com/withplumix/plumix/issues/1445)); this wires up the missing producer so authors can actually choose one.

  - The editor's Page tab shows a "Template" picker listing the `named` templates registered for the current entry type, plus a "(theme default)" option. The pick is written to the reserved `__plumix_template` entry-meta key via a new first-class `template` field on `entry.update` (`null` clears it) — it bypasses the plugin meta-box sanitizer, which still rejects the reserved key on the `meta` path.
  - The set of named templates per type is surfaced to the precompiled admin through the manifest (`collectNamedTemplates` → `buildManifest` options → `EntryTypeManifestEntry.namedTemplates`), never a direct theme import.
  - The preview overlay now keeps `__plumix_template` when stripping reserved autosave meta, so an unsaved pick drives the preview render. A published entry's saved choice resolves to its template on the public route.

## 0.4.0

## 0.3.0

## 0.2.0

## 0.1.4

## 0.1.3

## 0.1.2

### Patch Changes

- [#1330](https://github.com/withplumix/plumix/pull/1330) [`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2) Thanks [@nasyrov](https://github.com/nasyrov)! - Deduplicate the admin's Tailwind `@theme` token mapping. `@plumix/admin` now
  owns it as `theme.css` and ships it in `dist`; plumix's per-plugin CSS sidecar
  reads it from the installed admin package instead of keeping its own hand-synced
  copy. No public API change.

- [#1334](https://github.com/withplumix/plumix/pull/1334) [`56a4d4a`](https://github.com/withplumix/plumix/commit/56a4d4a4351aafe1468897b2e1f5da1bd5175edb) Thanks [@nasyrov](https://github.com/nasyrov)! - Bump `react-hook-form` from 7.80.0 to 7.81.0 (a runtime dependency of the admin
  UI) and `@playwright/test` from 1.61.0 to 1.61.1 (dev-only, e2e). No API or
  behavior change.

## 0.1.1
