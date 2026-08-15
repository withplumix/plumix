# @plumix/plugin-media

## 0.5.0

### Minor Changes

- [#1770](https://github.com/withplumix/plumix/pull/1770) [`f579afb`](https://github.com/withplumix/plumix/commit/f579afbbf0e297b1c591d23a2c3b20c178880bc6) Thanks [@nasyrov](https://github.com/nasyrov)! - Remove the redundant `lookup.resolve` RPC and `LookupAdapter.resolve`.

  The single-reference admin picker now resolves its selected id through the
  batched `lookup.list({ ids })` path (the same path the multi-reference picker
  and the meta read/write pipeline already use), so the dedicated
  `lookup.resolve` procedure had no remaining caller. It is removed along with
  its `LookupAdapter.resolve` contract method — `list({ ids })` covers single-id
  resolution, so a lookup adapter now implements one query method (`list`) plus
  the optional `hydrate`/`embeddedCacheTags`. The built-in `user`, `entry`,
  `term`, and `media` adapters drop their `resolve` implementations accordingly.

  `lookup.resolve` was the authenticated admin RPC surface only (not REST- or
  public-exposed), so no public HTTP contract changes.

  Migration: if you implemented a custom `LookupAdapter`, drop its `resolve`
  method — `list({ ids })` is now the single-id path. If you called the
  `lookup.resolve` RPC directly, switch to `lookup.list({ ids: [id] })` and read
  the single item from `items`.

## 0.4.0

### Minor Changes

- [#1709](https://github.com/withplumix/plumix/pull/1709) [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650) Thanks [@nasyrov](https://github.com/nasyrov)! - Add per-entity OpenGraph `og:image` from a featured media field.

  Theme and plugin authors can mark a media field `media("hero").featured()` (the
  entry's representative image) or `media("share").ogImage()` (an explicit
  social-share override). Public entry pages now emit a per-entity `og:image` —
  resolved as the `ogImage`-role field → the `featured`-role field → the existing
  site-wide `default_og_image` — and upgrade the Twitter card to
  `summary_large_image`, instead of only the single site default. The field name is
  free; the role is what core keys on, and it reads the hydrated media reference
  structurally so core takes no dependency on `@plumix/plugin-media`.

  `buildManifest` rejects an entry type with more than one `featured` field, and any
  role-tagged field that stores multiple values, so a per-entity `og:image` always
  resolves to one deterministic image. The Cloudflare edge SVG→PNG rasterization
  path and storage-backed serve route are tracked separately ([#1708](https://github.com/withplumix/plumix/issues/1708)).

### Patch Changes

- [#1731](https://github.com/withplumix/plumix/pull/1731) [`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41) Thanks [@nasyrov](https://github.com/nasyrov)! - Augment the public `plumix` specifier instead of the `plumix/plugin` subpath.

  These plugins declared their `TemplateDepRegistry`, `ReferenceHydrationShapes`,
  `FilterRegistry`, `ActionRegistry`, and `AppContextExtensions` contributions via
  `declare module "plumix/plugin"`. A theme augmenting a registry through the root
  `plumix` specifier (the documented convention, [#1691](https://github.com/withplumix/plumix/issues/1691)) would not co-merge with a
  `plumix/plugin` augmentation of the same interface — declaration merging
  fractures across specifiers, dropping one side's keys. All augmentations now
  target `declare module "plumix"` so themes and plugins share one merged view.

  No runtime or public-API change: the plugins' value imports still come from
  `plumix/plugin`, and consumers read the contributed kinds through the same
  `defineTemplate` / reference-field surfaces as before.

## 0.3.0

### Minor Changes

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

## 0.2.0

### Minor Changes

- [#1526](https://github.com/withplumix/plumix/pull/1526) [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields now store plain ids (or id arrays) — the write-time snapshot machinery is gone: the object value-shape (`ReferenceTarget.valueShape`), the adapter cached-fields seam (`LookupResult.cached`), and the write-time cached-reference rewrite are all removed. Values stored under the old `{ id, ... }` shape self-heal transparently: reads yield the id, and the entity's next save persists the plain form. `LookupResult` gains a first-class `href` (entry permalink / term archive) that menu resolution reads directly. The media `media()` / `mediaList()` builders drop the `MediaValue` type (`default` is now an id / id array), and the admin media pickers resolve labels through the batched lookup path instead of stored snapshots.
