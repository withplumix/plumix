# @plumix/admin

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
