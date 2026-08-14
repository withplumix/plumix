# plumix

## 0.13.0

### Patch Changes

- Updated dependencies [[`f3971a8`](https://github.com/withplumix/plumix/commit/f3971a8ec726a12ab7aa2e0c2897d48f3d5c4889), [`6d6db5c`](https://github.com/withplumix/plumix/commit/6d6db5c6a2defabfc0737f570f4d30a40c7ee67d), [`4f5730d`](https://github.com/withplumix/plumix/commit/4f5730dcaecb587396c41f7c10229f3689de52c8), [`dcda2fa`](https://github.com/withplumix/plumix/commit/dcda2fa124117175f5a56f587c22e95d6f14d89e), [`202a1fc`](https://github.com/withplumix/plumix/commit/202a1fc788e5386c08ba6c9d69bbba49c3503fc6), [`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d)]:
  - @plumix/core@0.13.0
  - @plumix/blocks@0.13.0
  - @plumix/admin@0.13.0
  - @plumix/admin-editor@0.13.0
  - @plumix/admin-ui@0.13.0

## 0.12.0

### Minor Changes

- [#1680](https://github.com/withplumix/plumix/pull/1680) [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af) Thanks [@nasyrov](https://github.com/nasyrov)! - Install the dev-only client error tools from one core-owned entry point.

  The island error dialog, the browser-errors-to-terminal forwarder, and the
  compile/import error overlay are now installed from a single browser-safe
  `@plumix/core/dev-client` export (reached through the `plumix` package as
  `plumix/core/dev-client`), which the generated client bootstrap calls behind the
  `import.meta.hot` dev gate. `@plumix/blocks`'s island runtime no longer installs
  any overlay or forwarder — it only hydrates islands and dispatches the
  `plumix:island-*` events the core-installed dialog listens for. The dependency
  runs core → blocks (no cycle), and nothing in `@plumix/blocks` outside its
  `dev-error/` implementation imports dev-error.

  This is behind the existing `PLUMIX_DEV` / `import.meta.hot` gates, so it
  tree-shakes out of production exactly as before: an island hydration mismatch
  still shows the dialog, a Vite compile error still shows the overlay, and client
  errors still forward to the terminal — now all wired from one place.

  The `plumix/blocks/dev-error` subpath — an internal wiring seam the generated
  client bootstrap used to reach the compile overlay — is removed, since install
  now goes through `plumix/core/dev-client`. The dev-error implementations
  themselves remain in `@plumix/blocks` and are unaffected.

- [#1706](https://github.com/withplumix/plumix/pull/1706) [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `plumix/db` (`@plumix/core/db`) subpath and complete the direct-write toolkit.

  A plugin running a bulk-ingest pipeline writes directly to `ctx.db`, which
  bypasses core's entry-mutation service — so no `entry:*`/`term:*` action fires
  and core's edge-cache purge invalidator never runs, leaving the public archive
  and permalinks stale until TTL. Making that path first-class needed two things
  the public API didn't expose:

  - **The edge-cache tag vocabulary.** `typeTag`, `entryTag`, `entryPurgeTags`,
    `termPurgeTags`, and `enqueuePurgeTags` are now exported, so a direct-write
    plugin can enqueue the same coarse `t:<type>`/`e:<id>` tags core would —
    `enqueuePurgeTags(ctx, entryPurgeTags(type, id))` — for the post-request /
    scheduled flush, instead of hand-restating the scheme (PRD [#1080](https://github.com/withplumix/plumix/issues/1080)) and drifting
    when it changes.
  - **The Drizzle table-introspection helpers.** `getTableColumns`, `getTableName`,
    and `is` live on the `drizzle-orm` root rather than its `/sql` subpath, so they
    weren't reachable through core. `getTableColumns` in particular is how a bulk
    `onConflictDoUpdate` derives its set clause — without it a plugin had to add
    its own `drizzle-orm` dependency (which can drift from core's pinned version).

  The new `plumix/db` / `@plumix/core/db` subpath groups the whole toolkit — query
  operators, schema tables, introspection helpers, and the purge vocabulary — in
  one import so a direct-write plugin never needs its own `drizzle-orm`
  dependency. Everything is also reachable from the flat package root.

### Patch Changes

- [#1704](https://github.com/withplumix/plumix/pull/1704) [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix `IslandPropSerializationError: Cyclic reference` when a `"use client"` island
  renders a shared client primitive such as a Radix/shadcn context component (e.g.
  `Tabs`).

  Island props are now serialized exactly once, at the outermost boundary. A
  `"use client"` component becomes an island when it carries an explicit hydration
  directive (`client=…`) or is the outermost such component in the render; a
  non-directive `"use client"` component rendered inside an island now renders
  inline (bundled into the parent island) instead of becoming its own island and
  re-serializing props. This stops the serializer from walking the cyclic React
  Context objects that libraries like Radix thread through their internals.

  Components passed into an island as `children`/slots still become their own
  island and hydrate independently, and intentional nested islands (an explicit
  `client=` directive) are unchanged.

- Updated dependencies [[`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41), [`665a57b`](https://github.com/withplumix/plumix/commit/665a57b421fc2f82dcf0dad7d0a89e2497557959), [`c74ca2f`](https://github.com/withplumix/plumix/commit/c74ca2ffc069209d543e5d606a2ded8b22245a1e), [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af), [`30f287e`](https://github.com/withplumix/plumix/commit/30f287e72470efd50ce4e95183c4f7e89f8e0843), [`88b6db2`](https://github.com/withplumix/plumix/commit/88b6db2b94c94a0a9c12f4d8cb84289f28cd7558), [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0), [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c), [`05ea95c`](https://github.com/withplumix/plumix/commit/05ea95c65a798ea2b74b7b3f3f533471aa4a483e), [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650), [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a), [`5785f19`](https://github.com/withplumix/plumix/commit/5785f19862495b1c445640fbc58a3210d6b0c2ff)]:
  - @plumix/core@0.12.0
  - @plumix/blocks@0.12.0
  - @plumix/admin-editor@0.12.0
  - @plumix/admin@0.12.0
  - @plumix/admin-ui@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef), [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b)]:
  - @plumix/blocks@0.11.0
  - @plumix/admin@0.11.0
  - @plumix/admin-editor@0.11.0
  - @plumix/core@0.11.0
  - @plumix/admin-ui@0.11.0

## 0.10.0

### Minor Changes

- [#1661](https://github.com/withplumix/plumix/pull/1661) [`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d) Thanks [@nasyrov](https://github.com/nasyrov)! - Retain forwarded client errors in a dev ring behind a read endpoint.

  In `plumix dev`, the browser-errors-to-terminal forwarder now also keeps each
  already-sourcemapped client failure — uncaught exceptions, unhandled rejections,
  island and hydration errors, and forwarded `console` errors/warnings — in a
  bounded ring alongside the existing terminal print. The ring is capacity- and
  byte-bounded with per-string truncation, mirroring the server-side request
  history store, so a burst of client errors can't pin memory.

  A new dev-only GET endpoint returns the retained entries newest-first, each
  preserving `source: "client"`, its level, message, resolved stack, and the
  island/component label when present. This is the client half of the dev-only MCP
  `error_list` surface: the worker-side tool merges these entries with its
  server-side projection. Terminal printing is unchanged, and the whole path stays
  gated on `process.env.PLUMIX_DEV` and tree-shakes out of production.

### Patch Changes

- Updated dependencies [[`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d)]:
  - @plumix/blocks@0.10.0
  - @plumix/admin@0.10.0
  - @plumix/admin-editor@0.10.0
  - @plumix/core@0.10.0
  - @plumix/admin-ui@0.10.0

## 0.9.0

### Minor Changes

- [#1651](https://github.com/withplumix/plumix/pull/1651) [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an open-in-editor path remap for container and remote dev servers.

  The dev error page's "Open in editor" links use the file path as the dev server
  sees it, which doesn't exist on your machine when the server runs in a container,
  a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
  `from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
  prefix is rewritten to the editor-host path before each link is built, so the
  links open the right file. Only the path prefix is remapped, on a path boundary;
  paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
  `plumix dev` and tree-shakes out of production builds.

- [#1647](https://github.com/withplumix/plumix/pull/1647) [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an opt-in `log` level to the dev browser-errors-to-terminal forwarder.

  The forwarder ([#1604](https://github.com/withplumix/plumix/issues/1604)) deliberately mirrors only `console.error`/`console.warn`
  and uncaught exceptions to the `plumix dev` terminal, because plain logs are
  noisy. Setting `PLUMIX_FORWARD_ERRORS=log` now additionally forwards
  `console.log`, `console.info`, and `console.debug`, printed through the same
  `[browser]`-tagged, sourcemapped, repeat-collapsing path as everything else — so
  the verbose case stays on one contract rather than splitting output to Vite's
  native `forwardConsole`. The default is unchanged (`warn`), and the whole path
  remains dev-only and tree-shaken from production island bundles.

- [#1643](https://github.com/withplumix/plumix/pull/1643) [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80) Thanks [@nasyrov](https://github.com/nasyrov)! - Unify Vite's compile/import errors with the dev error surface.

  In `plumix dev`, a syntax error or a bad import used to show Vite's own error
  overlay — visually and behaviorally disjoint from the plumix dev error page and
  the client island overlay. Plumix now disables Vite's built-in overlay
  (`server.hmr.overlay: false`) and installs its own from the always-present dev
  client entry: it intercepts Vite's `vite:error` HMR payload and renders it
  through the _same_ shared `DevErrorPage` renderer and token sheet, in a Shadow
  DOM modal over a dimmed backdrop. So compile errors now read like every other
  plumix dev error — same header, code frame, and styling — and clear on their own
  when the module recompiles (Escape, the close button, or a backdrop click also
  dismiss). The whole surface is dev-only, gated on `import.meta.hot`, so it
  tree-shakes out of the production client bundle; a user can re-enable Vite's own
  overlay from their `vite` config.

### Patch Changes

- Updated dependencies [[`24d9639`](https://github.com/withplumix/plumix/commit/24d96390631893c788b54fe6261c781ad798969c), [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e), [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407), [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec), [`c16b2bc`](https://github.com/withplumix/plumix/commit/c16b2bcc112c82459a090a5e59fe263ee55ff658), [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80)]:
  - @plumix/core@0.9.0
  - @plumix/blocks@0.9.0
  - @plumix/admin@0.9.0
  - @plumix/admin-editor@0.9.0
  - @plumix/admin-ui@0.9.0

## 0.8.0

### Minor Changes

- [#1621](https://github.com/withplumix/plumix/pull/1621) [`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5) Thanks [@nasyrov](https://github.com/nasyrov)! - Forward browser/island errors to the dev terminal.

  In `plumix dev`, client failures now also surface where the developer is already
  working. A dev-only catch net mirrors the island error overlay's producers —
  uncaught exceptions, unhandled rejections, and the island renderer's
  `plumix:island-error` / `plumix:hydration-error` events — and additionally
  patches `console.error` and `console.warn` (never `console.log`). Each entry is
  batched and POSTed to a new Vite dev-server endpoint, which sourcemaps the stack
  through the dev server's per-module sourcemaps and prints it tagged `[browser]`
  with a project-relative `file:line`, application frames shown and framework
  frames collapsed to a count. Consecutive identical entries collapse into a
  running `(×N)` count.

  On by default and tuned by `PLUMIX_FORWARD_ERRORS` (`off` disables, `error`
  drops warnings, the default forwards both). Everything is gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production island bundles.
  Vite 8's native `forwardConsole` is disabled by the plugin so client output
  isn't printed twice; a consumer can re-enable it in their own `vite` config.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1608](https://github.com/withplumix/plumix/pull/1608) [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve dev error-page stack frames to original source with a code excerpt.

  The `plumix dev` error page now parses the (already-sourcemapped) stack into
  frames showing each original `file:line`, with application frames expanded and
  framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
  source excerpt with the offending line highlighted — lazy-fetched from a new
  dev-only source resolver mounted as a Vite middleware, so the worker (which has
  no filesystem) never reads source itself. Paths are shown relative to the
  project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
  and tree-shakes out of production.

### Patch Changes

- Updated dependencies [[`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5), [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725), [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff), [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d), [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35), [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443), [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0), [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0), [`112e1bd`](https://github.com/withplumix/plumix/commit/112e1bd6d0ab8f9579ef8a87651d3a996faf75b9), [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a), [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c), [`5beb3ce`](https://github.com/withplumix/plumix/commit/5beb3ced84758f4255356f1118442a45ecaa01b6), [`154e9e4`](https://github.com/withplumix/plumix/commit/154e9e44c538a8a89056f6be6c5e6fbb1d305c36)]:
  - @plumix/blocks@0.8.0
  - @plumix/core@0.8.0
  - @plumix/admin@0.8.0
  - @plumix/admin-editor@0.8.0
  - @plumix/admin-ui@0.8.0

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1532](https://github.com/withplumix/plumix/pull/1532) [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders, part two (breaking, pre-1.0): the remaining eight scalar field constructors on `plumix/fields` — `number`, `range`, `date`, `datetime`, `time`, `color`, `richtext`, `json` — now author as immutable chained builders instead of flat option objects: `number("rating").min(1).max(5).step(0.5)`, `richtext("body").marks(["bold"]).nodes(["heading"])`. Per-type chains expose only the options that apply (`number(...).maxLength(...)` is a compile error); `range` requires `.min()`/`.max()` and enforces `min <= max` at registration; `color` and `range` keep their injected default sanitizers (a custom `.sanitize()` replaces them); `richtext` always injects the allowlist walker and deliberately offers no `.sanitize()`. Removed: the flat `NumberFieldOptions`/`RangeFieldOptions`/`DateFieldOptions`/`DateTimeFieldOptions`/`TimeFieldOptions`/`ColorFieldOptions`/`RichtextFieldOptions`/`JsonFieldOptions` types; `DateMetaBoxField`/`DateTimeMetaBoxField`/`TimeMetaBoxField` are now aliases of `TemporalMetaBoxField<I>`.

  New: `.returns("date")` on `date`/`datetime`/`time` projects the stored ISO string to a JS `Date` at decode time and the inferred read type follows (`Date | undefined`, narrowed by `.required()`/`.default()`); the default read stays the ISO string. Projected `Date`s anchor their wall-clock components to UTC (`date` at UTC midnight, `time` on 1970-01-01 UTC) so they survive any server/browser timezone split — read components back with `getUTC*` or `timeZone: "UTC"` formatting. Symmetrically, temporal fields now accept a `Date` on the write side and store the field's ISO shape from UTC components, so admin round-trips of projected values are lossless; `formatTemporalValue` on `@plumix/core/manifest` exposes the shared formatter.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1527](https://github.com/withplumix/plumix/pull/1527) [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders (breaking, pre-1.0): the five string scalar field constructors on `plumix/fields` — `text`, `textarea`, `email`, `url`, `password` — now author as immutable chained builders instead of flat option objects: `text("subtitle").placeholder("…").maxLength(120)` replaces `text({ key, label, … })`. Labels default to the humanized key; the universal chain adds `.label()` (string or message descriptor), `.description()`, `.placeholder()`, `.prepend()`/`.append()`, `.default()`, `.required()`, `.span()`, `.capability()`, `.showInApi()`, `.sanitize()`, and `.validate()`, with phantom value typing (`string | undefined`, narrowed to `string` by `.required()`/`.default()`). Every `fields` registration surface (entry/term/user meta boxes, settings groups, repeater `subFields`) accepts builders alongside plain field definitions and compiles them at registration. `.span()` is accepted on every surface as a universal layout hint — the `EntryMetaBoxField` span-omit union is gone (the entry editor rail still ignores and strips the hint). Removed: the flat `TextFieldOptions`/`TextareaFieldOptions`/`EmailFieldOptions`/`UrlFieldOptions`/`PasswordFieldOptions` types; the five per-variant field interfaces are now aliases of `StringMetaBoxField<I>`. Repeater rows no longer feed absent (`null`/omitted) subfield values into sanitize callbacks, mirroring top-level deletion semantics.

- [#1538](https://github.com/withplumix/plumix/pull/1538) [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d) Thanks [@nasyrov](https://github.com/nasyrov)! - Read-time reference hydration is now cache-correct: a page that embeds a referenced entity carries that entity's cache tag and is purged when the entity changes. A per-request accumulator collects tags during hydration and the public read-through folds them into the page's stored cache tags, so editing, deleting, or otherwise changing an embedded entry busts the pages that hydrated it (the entry adapter contributes its precise `e:<id>` tag through the existing purge pipeline). Lookup adapters gain an optional `embeddedCacheTags(payload)` method to declare the tag a hydrated payload contributes; kinds without a per-entity purge identity (e.g. `user`) omit it. A new server-side `hydrateReferences(ctx, kind, ids, { scope })` helper gives themes the same batched adapter path and tag accounting for id-only reference fields, resolving an id set in one in-query per chunk and returning the hydrated payloads dense and in requested order. Pages that hydrate nothing are tagged exactly as before.

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

- [#1530](https://github.com/withplumix/plumix/pull/1530) [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd) Thanks [@nasyrov](https://github.com/nasyrov)! - Typed meta reads (breaking, pre-1.0): declared fields now flow into typed reads everywhere via contribution-keyed registries. Augment `EntryMetaContributions` / `TermMetaContributions` / `UserMetaContributions` (keyed by box id) or `SettingsContributions` (keyed by group name) with `{ entryTypes: "post"; fields: typeof myFields }`, and `MetaOf<K>` / `TermMetaOf<K>` / `UserMetaOf` / `SettingsOf<Name>` fold every contribution targeting `K` into one closed record — a mistyped field name is a compile error in the theme. Targeted templates (`forEntryType(...)`, `forTermTaxonomy(...)`) receive entries and terms with the folded typed `meta` (`ResolvedEntryFor<K>` / `ResolvedTermFor<K>`), and `whereMeta` keys/values are typed against the distinct stored shapes (`StoredMetaOf<K>` / `StoredTermMetaOf<K>` via `InferStoredFields` — `.default()` narrows only the read shape). When a contribution declaration exists for a box id, the matching `register*` call is typechecked against it (target set and fields must match); a missing declaration degrades to absence from the typed record and can be supplied from any package via interface merging. Removed: the `meta` projection slot on `EntryTypeRegistry` / `TermTaxonomyRegistry` — `MetaOf`/`TermMetaOf` no longer read it and no longer fall back to an open `Record<string, unknown>`, so `whereMeta` on a type with no declared contributions accepts no keys.

### Patch Changes

- Updated dependencies [[`7d5d664`](https://github.com/withplumix/plumix/commit/7d5d664dca8c1fb726b9fc7f1607b3ad41d26708), [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a), [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c), [`8018aba`](https://github.com/withplumix/plumix/commit/8018aba6d6490f466c253206e41f45b0989f38f8), [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b), [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797), [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f), [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511), [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd), [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90), [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d), [`1609a52`](https://github.com/withplumix/plumix/commit/1609a52c98056fab7e15a4a50963d717ec1d665a), [`9f6a5a8`](https://github.com/withplumix/plumix/commit/9f6a5a8025ba3c1f103473b912f6474045d1f5e5), [`4617ca9`](https://github.com/withplumix/plumix/commit/4617ca9b66873d4c83debe78f8d7f2a3b58e2479), [`f58edfb`](https://github.com/withplumix/plumix/commit/f58edfbfa4d743ec41143366da219160cfc3e9fb), [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b), [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2), [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d), [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027), [`0b8c1c0`](https://github.com/withplumix/plumix/commit/0b8c1c0bb99b630d58bf7e97690d6a9df4a16814), [`3df62e3`](https://github.com/withplumix/plumix/commit/3df62e300348aa90bb8b4a9fd1883adf8e5c03ee), [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd), [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a)]:
  - @plumix/core@0.7.0
  - @plumix/admin@0.7.0
  - @plumix/admin-ui@0.7.0
  - @plumix/admin-editor@0.7.0
  - @plumix/blocks@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`f737d54`](https://github.com/withplumix/plumix/commit/f737d54854c422ad564c98649b58c2a259f8322b), [`642dcf6`](https://github.com/withplumix/plumix/commit/642dcf6b2cd42e4f9aca5ddf007dc3f6b1f7f613), [`d6c456a`](https://github.com/withplumix/plumix/commit/d6c456a6bf365f492a7024bf7a83da77d006b8d7), [`4c9205a`](https://github.com/withplumix/plumix/commit/4c9205a8dfadfd9b54983b032e234bf4c7ab9ec8), [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e), [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3), [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c), [`75ef282`](https://github.com/withplumix/plumix/commit/75ef282365fc02cf9520494e3f757cf5a6879880), [`af1af74`](https://github.com/withplumix/plumix/commit/af1af74a925ea4ba5f8ab1c153a466a13195ad68)]:
  - @plumix/core@0.6.0
  - @plumix/admin@0.6.0
  - @plumix/admin-editor@0.6.0
  - @plumix/blocks@0.6.0
  - @plumix/admin-ui@0.6.0

## 0.5.0

### Minor Changes

- [#1479](https://github.com/withplumix/plumix/pull/1479) [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an entry-editor template picker for theme-registered `named` templates. A theme exposes author-selectable templates via `forEntryType("page").named("landing", "Landing Page").template(...)` (shipped in [#1445](https://github.com/withplumix/plumix/issues/1445)); this wires up the missing producer so authors can actually choose one.

  - The editor's Page tab shows a "Template" picker listing the `named` templates registered for the current entry type, plus a "(theme default)" option. The pick is written to the reserved `__plumix_template` entry-meta key via a new first-class `template` field on `entry.update` (`null` clears it) — it bypasses the plugin meta-box sanitizer, which still rejects the reserved key on the `meta` path.
  - The set of named templates per type is surfaced to the precompiled admin through the manifest (`collectNamedTemplates` → `buildManifest` options → `EntryTypeManifestEntry.namedTemplates`), never a direct theme import.
  - The preview overlay now keeps `__plumix_template` when stripping reserved autosave meta, so an unsaved pick drives the preview render. A published entry's saved choice resolves to its template on the public route.

- [#1487](https://github.com/withplumix/plumix/pull/1487) [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392) Thanks [@nasyrov](https://github.com/nasyrov)! - Add the telemetry consumer contract and split the collection gate off the debug bar. A site operator registers consumers once in app config and receives a JSON-serializable snapshot of every sampled request post-response:

  ```ts
  plumix({
    telemetry: {
      consumers: [
        {
          id: "my-exporter",
          sample: (ctx) => Math.random() < 0.1, // head-sampling; omitted = always
          onRequestEnd: async (snapshot, ctx) => {
            /* envelope + span tree + records + dropped counters */
          },
        },
      ],
    },
  });
  ```

  - The collector core is now always present in production bundles and activates per request iff at least one registered consumer votes yes — with no consumers it stays the no-op and production pays nothing. The debug-bar UI remains dev-only and dead-code-eliminated; in dev it registers as the first consumer.
  - `TelemetrySnapshot` carries a request envelope (`requestId`, `method`, `url`, `status`, `startedAt`, `durationMs`), root spans, timestamped records by namespace, and dropped counters. Delivery rides `ctx.defer` — `waitUntil` on the Cloudflare adapter — so export I/O never blocks the response; a 500 still delivers its snapshot.
  - New public types from `@plumix/core`: `TelemetryConsumer`, `TelemetrySnapshot`, `TelemetryRequestEnvelope`, `TelemetryConfig` (plus the existing span/record types are now exported).
  - The collector no longer source-drops namespaces for disabled debug-bar panels — panel disable stays a render-time filter; data collection is consumer-owned.

- [#1490](https://github.com/withplumix/plumix/pull/1490) [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009) Thanks [@nasyrov](https://github.com/nasyrov)! - Unifies automatic DB query tracing: every query flowing through `ctx.db` — libsql, D1, the demo runtime, and statements inside transactions — now appears in the telemetry snapshot as one `db: <kind>` span with `db.sql`, `db.params` (lazy, JSON-safe), and `db.rows` attributes, regardless of whether core or a plugin issued it.

  - One wrap at client construction per driver: `traceSqlClient` (libsql `execute`/`batch`/`transaction`), a new `traceD1Client` in the Cloudflare runtime (prepared statements, batches, and drizzle's emulated begin/commit transactions — timed for the first time), and the demo Durable-Object proxy callbacks. Batches are one round-trip and one span, carrying per-statement sql/params under `db.batch` and the summed row count.
  - Tracing is unconditional — no `PLUMIX_DEV` gate. Without an active collector (no consumer sampled the request) every span is a pass-through no-op, so production without telemetry consumers pays nothing; with a prod consumer registered, query spans now flow to it.
  - The drizzle-logger half of the old dual mechanism is deleted: `createDebugSqlLogger` is gone from `@plumix/core`, and the Database debug-bar panel renders from query spans (now with per-query durations) instead of the removed record channel. New shared helpers `traceDbQuery`/`traceDbBatch` are exported for runtime adapters.
  - DB connections not obtained from `ctx.db` remain an untraced platform boundary.

### Patch Changes

- Updated dependencies [[`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5), [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f), [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392), [`b3ad524`](https://github.com/withplumix/plumix/commit/b3ad5247e8dcfd6c2adaeb03f0e22c8a5b5e530d), [`7455fa6`](https://github.com/withplumix/plumix/commit/7455fa68660a5f9ad85e8c6d5a728c747990289c), [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009)]:
  - @plumix/core@0.5.0
  - @plumix/admin@0.5.0
  - @plumix/admin-editor@0.5.0
  - @plumix/blocks@0.5.0
  - @plumix/admin-ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e), [`e96e27d`](https://github.com/withplumix/plumix/commit/e96e27d5b6e378fb049431871386c7dcc643bff1), [`0ad5a4b`](https://github.com/withplumix/plumix/commit/0ad5a4bd85c8a57b2fe4cc6bc8803795775c6140), [`39b02e8`](https://github.com/withplumix/plumix/commit/39b02e8595e2d28291014d47bfa8f65d16f976f2)]:
  - @plumix/core@0.4.0
  - @plumix/blocks@0.4.0
  - @plumix/admin@0.4.0
  - @plumix/admin-editor@0.4.0
  - @plumix/admin-ui@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910)]:
  - @plumix/core@0.3.0
  - @plumix/admin@0.3.0
  - @plumix/admin-editor@0.3.0
  - @plumix/blocks@0.3.0
  - @plumix/admin-ui@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d)]:
  - @plumix/core@0.2.0
  - @plumix/admin@0.2.0
  - @plumix/admin-editor@0.2.0
  - @plumix/blocks@0.2.0
  - @plumix/admin-ui@0.2.0

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
