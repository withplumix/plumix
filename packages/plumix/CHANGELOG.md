# plumix

## 0.1.4

### Patch Changes

- Updated dependencies [[`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f)]:
  - @plumix/core@0.1.4
  - @plumix/admin@0.1.4
  - @plumix/admin-editor@0.1.4
  - @plumix/blocks@0.1.4
  - @plumix/admin-ui@0.1.4

## 0.1.3

### Patch Changes

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `virtual:plumix/worker-exports` codegen seam so a runtime adapter can contribute named exports — such as a Durable Object class — to the generated Cloudflare worker via `RuntimeAdapter.workerExports`. Core never learns about any specific feature; the seam is reusable by any future Durable Object, queue, or realtime adapter.

  The `auth.session` procedure now resolves the current user through the configured authenticator instead of a hardcoded session cookie, so custom authenticators (SSO, the demo sandbox) report the signed-in user on boot. The default cookie-backed behavior is unchanged.

- Updated dependencies [[`c37b6db`](https://github.com/withplumix/plumix/commit/c37b6dba1913322aabc85e9b2876b433efe73351), [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756)]:
  - @plumix/core@0.1.3
  - @plumix/admin@0.1.3
  - @plumix/admin-editor@0.1.3
  - @plumix/blocks@0.1.3
  - @plumix/admin-ui@0.1.3

## 0.1.2

### Patch Changes

- [#1330](https://github.com/withplumix/plumix/pull/1330) [`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2) Thanks [@nasyrov](https://github.com/nasyrov)! - Deduplicate the admin's Tailwind `@theme` token mapping. `@plumix/admin` now
  owns it as `theme.css` and ships it in `dist`; plumix's per-plugin CSS sidecar
  reads it from the installed admin package instead of keeping its own hand-synced
  copy. No public API change.
- Updated dependencies [[`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2), [`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139), [`56a4d4a`](https://github.com/withplumix/plumix/commit/56a4d4a4351aafe1468897b2e1f5da1bd5175edb)]:
  - @plumix/admin@0.1.2
  - @plumix/core@0.1.2
  - @plumix/admin-editor@0.1.2
  - @plumix/blocks@0.1.2
  - @plumix/admin-ui@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045)]:
  - @plumix/core@0.1.1
  - @plumix/admin@0.1.1
  - @plumix/admin-editor@0.1.1
  - @plumix/blocks@0.1.1
  - @plumix/admin-ui@0.1.1
