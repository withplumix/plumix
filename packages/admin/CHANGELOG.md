# @plumix/admin

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
