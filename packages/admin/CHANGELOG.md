# @plumix/admin

## 0.20.0

### Patch Changes

- [#2131](https://github.com/withplumix/plumix/pull/2131) [`36723db`](https://github.com/withplumix/plumix/commit/36723db2903a0156a12b598a62755d2d5cf25e41) Thanks [@nasyrov](https://github.com/nasyrov)! - Ships third-party license notices with the prebuilt admin. `dist` now carries `THIRD-PARTY-NOTICES.txt` for every bundled library plus the licenses for the fonts and CSS it inlines, and the build fails if a dependency is not permissively licensed. Replaces `ua-parser-js` 2.x, which relicensed to AGPL-3.0, with the MIT-licensed 1.x line — session rows now read "Mac OS" where they read "macOS".

## 0.19.0

### Minor Changes

- [#2056](https://github.com/withplumix/plumix/pull/2056) [`9ebc490`](https://github.com/withplumix/plumix/commit/9ebc4901f8ad99101904901a2543ce3c32a3f695) Thanks [@nasyrov](https://github.com/nasyrov)! - Lets a condition apply inside a repeater row or a group, judged against that row's or group's own
  values.

  `.visibleWhen()` was refused on a sub-field at registration, because nothing evaluated it one scope
  down: the admin rendered every sub-field regardless, and the write pipeline validated every cell. A
  row whose `kind` decides which siblings apply had to show all of them at once — a row of kind
  "Text" offering the "Choices" list that belongs to "Dropdown".

  Both evaluators now read the row's or group's own bag, so `repeater("fields").fields([kind,
text("choices").visibleWhen(kind.is("select"))])` registers and behaves the way the same chain does
  on a box's fields: the admin shows and hides sub-fields live as the author changes the driver, and
  sibling rows never speak for each other. Registration still refuses a rule that names anything
  other than a sibling — a row cannot read a box-level key, so such a rule could never pass — and
  `sub_field_condition_unknown_driver` reports that mistake in place of the removed
  `sub_field_condition_not_supported`.

  On save a hidden cell runs under the same rules a draft does. Business constraints cannot fail on
  it, so a `.required()` sub-field behind a false condition can no longer block a publish with an
  error pointing at an input nobody can open; coercion, `.sanitize()` and the safety gates still run,
  and the value itself is kept. Keeping it matters more here than at box level, where a hidden key's
  stored value is simply left alone: a row is rewritten whole on every save, so a cell dropped once
  would be gone for good — including on a publish that re-runs rows the author never touched.

  Visibility inside a row reads an absent driver key as unset rather than unknown, which is what the
  admin does when it renders the same row. The box-level rule differs on purpose: a patch there may
  legitimately omit a driver, while a row is always written complete.

## 0.18.0

### Minor Changes

- [#2053](https://github.com/withplumix/plumix/pull/2053) [`d3d550c`](https://github.com/withplumix/plumix/commit/d3d550c4b87405d1c26e8e78c4adbda229d2727c) Thanks [@nasyrov](https://github.com/nasyrov)! - Gives the SEO plugin the two surfaces a person actually touches: a live search-result preview in
  the editor, and the rest of the settings screen.

  **In the editor**, the **Search & social** box on an entry now leads with a preview of the search
  result it will produce — the URL, the resolved title and the resolved description, each through the
  function the head runs, so the preview cannot show what the page will not carry. It updates as the
  author types, because the search title, the search description and the **Hide from search engines**
  toggle are read off the live form rather than off the saved row. Two length indicators track the
  resolved lines against 60 characters for the title and 155 for the description and say when one
  will be cut short. When the page is not offered to search engines the preview names the assertion
  that fired — the whole site, this entry, the content type, the taxonomy, a search-results page,
  page two of an archive, a page that was not found — which is what the reason string on the
  indexability predicate was built to carry. A term's box has no preview: it is written from an
  entry's permalink and excerpt, and a term archive has neither.

  The preview is a registered field type, so it reaches the editor through the plugin's own admin
  chunk. That is also why it is the one part of the plugin with Playwright coverage: the dispatcher
  harness cannot render a React control.

  **In settings**, the **SEO** page now composes three groups rather than one, each with its own Save
  and each gated by `settings:manage`:

  - **Search & social** — everything the site answers about its own content, as before.
  - **Site verification** — Google, Bing, Yandex, Baidu and Pinterest tokens, each reaching the head
    of every page under the meta name that engine reads.
  - **robots.txt** — hand-written content replacing the generated _rules_, so a rule can change
    without a deploy. The two site-wide answers compose around it rather than being replaced by it: a
    site with indexing turned off still disallows everything whatever the box holds, the AI-crawler
    group is still added while that toggle is on, and the `Sitemap:` line is still appended unless the
    author wrote one. The generated body carries that line too, which it did not before.

  Saving any of the three now purges the cached sitemap set _and_ the cached content pages of every
  registered entry type. Between them these groups rewrite a page's robots directive, title and
  verification tags, and the shipped cache has no site-wide tag to retire them by.

  `@plumix/admin` gains one thing on the plugin field-renderer contract: `siblings`, the other values
  in the bag the field's box binds to, as react-hook-form holds them. A control that describes the
  fields around it had no way to see them — `attrs` covers the block inspector only. Only the plugin
  branch subscribes, so a box of built-in inputs still re-renders one field per keystroke; a plugin
  control on an entry does re-render on any meta edit, since `meta` is one bag shared by every box on
  the entity.

  One bug fix comes with it. `plumix` builds the admin manifest at config time and never fired
  `theme:ready`, so anything a plugin registers from that handover was in the running worker's
  registry and missing from the admin's — which covered the SEO meta box and, since the settings
  groups moved there too, the whole SEO settings page. The manifest build now makes the same handover
  `buildApp` does.

## 0.17.0

## 0.16.0

### Minor Changes

- [#1936](https://github.com/withplumix/plumix/pull/1936) [`1a475b5`](https://github.com/withplumix/plumix/commit/1a475b599314a315a850832fd59f0cedec22e675) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs `settings.upsert` through the field pipeline, so a settings value is decoded on the way in
  rather than type-checked one read at a time on the way out.

  `settings.value` was `unknown` on the column because a value reached it straight off the RPC without
  passing any pipeline — nothing had proved its shape, so every reader narrowed it by hand. Keys a
  registered group owns now take the same write path as entry and term meta (coercion, `.sanitize()`,
  the declared constraints); keys nobody registered keep the laissez-faire write but still have to be
  JSON. The column, `SettingsBag`, and the `settings.get` / `settings.upsert` bags now say so, as does
  `SiteSettings` in `@plumix/blocks`, which is the same bag one hop downstream.

  Three consequences for callers. A registered field's declared constraints are enforced where they
  previously were not: a `number("per_page").max(50)` rejects `99` instead of storing it, and the
  rejection arrives as a `CONFLICT` with `reason: "settings_invalid_value"` carrying the same
  `{ path, message }` error list the meta write path returns — the settings card pins each one on the
  input it addresses, as the entry and term forms already did. A value arrives in its declared shape:
  the string `"10"` on a number field lands as `10`. And clearing a key a registered field marks
  `.required()` is refused rather than silently deleted, which is what the same `null` already meant on
  entry and term meta.

  The meta pipeline's own scalar coercion decodes with valibot instead of hand-written `typeof`
  ladders, and `.sanitize()` output is decoded on the same terms as its input. The descriptor types a
  callback's return as `JsonValue`, but nothing enforced that at runtime: a callback handing back a
  `Date` used to reach storage as one and become whatever `JSON.stringify` made of it later. Three
  edges move with it, all of them reachable only from a callback that ignores its declared return
  type. Returning `undefined` still means "write nothing", but now short-circuits the remaining
  constraints instead of running them against a value there is none of — on a `link()` or `color()`
  field that turns a rejected write into a skipped one. Returning `null` from a `string` / `number` /
  `boolean` field's callback is `invalid` rather than stored as `null`. And returning a value the
  field's declared type cannot hold is `invalid` rather than stored.

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

### Patch Changes

- [#1557](https://github.com/withplumix/plumix/pull/1557) [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725) Thanks [@nasyrov](https://github.com/nasyrov)! - Reflect title, excerpt, meta, and template edits in the editor's visual canvas.

  The canvas iframe live-synced only block content over its bridge; the entry
  fields the theme template renders around the blocks — title, excerpt, meta,
  and a `named`-template pick — stayed at their load-time server render until a
  manual reload. Now, after such a field autosaves, the host reloads the canvas
  (debounced, coalescing a burst of edits into one reload; block content and the
  scroll position are preserved), so the theme output tracks the edit.

  Two paths fed the stale output, both fixed:

  - The host never signaled the canvas to refresh for these fields. `PlumixEditor`
    gains a `previewRefreshToken` the editor bumps after a title / excerpt / meta /
    template autosave; `CanvasFrame` reloads the iframe when it changes.
  - The `?preview=` render itself froze the title. `overlayPreviewAutosave` copied
    `title` from the autosave snapshot, overriding a later live title edit — but
    the title is a live field (written with `saveAs: "live"`, like slug / parent /
    terms, which already came from the live row). The preview now overlays only
    the drafted fields (content, excerpt, meta) and reads the title from live.

- [#1607](https://github.com/withplumix/plumix/pull/1607) [`5beb3ce`](https://github.com/withplumix/plumix/commit/5beb3ced84758f4255356f1118442a45ecaa01b6) Thanks [@nasyrov](https://github.com/nasyrov)! - Reintroduce the starter picker for empty entries.

  The Puck-removal refactor ([#1143](https://github.com/withplumix/plumix/issues/1143)) dropped the "Pick a starter…" onboarding shown
  when authoring a blank entry, so new entries opened onto an empty canvas with no
  offered starting points — even though the pattern data layer still marked
  starter-eligible patterns (`target: "post-content"`, optional `entryTypes`,
  `priority`). The bespoke editor now surfaces them again:

  - `PlumixEditor` takes an `entryType` and, for a blank entry, opens a modal of
    the eligible starter patterns (ordered by priority) plus a "Start from blank"
    escape. Choosing one seeds the canvas with the pattern's blocks (fresh ids, a
    single undoable step); the editor stays empty on "Start from blank".
  - A toolbar "Pick a starter…" button re-summons the picker while the canvas is
    still empty, so a dismissal isn't final.

  Starter open state lives in the editor store; the read-only revision preview
  omits the picker.

- [#1605](https://github.com/withplumix/plumix/pull/1605) [`154e9e4`](https://github.com/withplumix/plumix/commit/154e9e44c538a8a89056f6be6c5e6fbb1d305c36) Thanks [@nasyrov](https://github.com/nasyrov)! - Restore the browse-revision-history button in the visual editor.

  The Puck-removal refactor ([#1143](https://github.com/withplumix/plumix/issues/1143)) left the bespoke `PlumixEditor` header with no
  slot for the revision-history affordance, so `edit.tsx` stopped wiring it for the
  visual branch — revision history became reachable only by hand-crafting a
  `?revision=<id>` URL. `PlumixEditor` (and its header) now take an optional
  `revisionsTrigger` slot, rendered as a history icon just after undo/redo, and the
  visual editor route wires `useRevisionsTrigger` into it — mirroring the plain-form
  editor (which keeps its labelled text button via the sheet's `triggerVariant`).
  The sheet's orpc calls stay in the app; the package only exposes the slot.

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1549](https://github.com/withplumix/plumix/pull/1549) [`1609a52`](https://github.com/withplumix/plumix/commit/1609a52c98056fab7e15a4a50963d717ec1d665a) Thanks [@nasyrov](https://github.com/nasyrov)! - Give the metabox `json()` field a syntax-highlighted code editor. The plain
  textarea is replaced with a CodeMirror editor (line-number gutter, JSON
  highlighting, bracket matching) that keeps the same behaviour — blank clears
  the value, valid JSON propagates, invalid JSON surfaces an inline parse error
  and leaves the last good value in place. The editor is code-split, so a form
  with no JSON field never loads the CodeMirror chunk.

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

- [#1550](https://github.com/withplumix/plumix/pull/1550) [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d) Thanks [@nasyrov](https://github.com/nasyrov)! - Rework the metabox repeater UI. Rows previously crammed every field inline into
  the narrow document rail, ran tall, and dropped each subfield's `.span()`. Now
  each row is a compact, scannable summary (a label from the `.collapsed()`
  subfield or the first non-empty value) with an Edit button; editing opens a
  roomy dialog that lays the row's fields out on the same 12-column grid the box
  uses, honoring each subfield's `.span()`. Adding a row opens its editor
  directly, and a row whose fields hold a validation error is flagged so it's
  discoverable while the dialog is closed. Groups likewise lay their members out
  on a span-aware grid.

  Repeater and group subfields now carry their `span` on the manifest wire
  (previously dropped as "children are full-width", since the old inline rail
  couldn't honor it) so the composite editors can lay them out.

- [#1548](https://github.com/withplumix/plumix/pull/1548) [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027) Thanks [@nasyrov](https://github.com/nasyrov)! - Render the metabox `richtext()` field as a real Tiptap editor instead of a raw-JSON textarea.

  The block editor's rich-text editor is now shared: it gained a JSON serialization mode (reads/writes the ProseMirror doc the field stores) and an optional marks/nodes allowlist that constrains both the editor schema and the toolbar, so a field authored with `.marks(["bold","link"]).nodes(["heading"])` only offers — and can only produce — the formatting it declares. The block editor's own usage is unchanged (HTML serialization and the full toolbar remain its defaults). The editor is code-split, so forms without a richtext field never load the ProseMirror chunk.

  Also fixes the server-side richtext validator to implicitly allow `hardBreak` and `listItem`: the shared editor always ships a Shift+Enter line break, and any allowed list carries list items, so a natural `.nodes(["bulletList"])` field could previously produce content its own editor offered but the server then rejected on save.

### Patch Changes

- [#1554](https://github.com/withplumix/plumix/pull/1554) [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c) Thanks [@nasyrov](https://github.com/nasyrov)! - Validate entry meta leniently on draft saves and strictly on publish, so
  work-in-progress never fails to save while published content stays valid.

  The field pipeline gains a `draft` / `strict` mode. In `draft` mode the
  business-rule constraints — required, numeric / temporal bounds, `maxLength`,
  option membership, format checks, repeater / group row counts, and
  `.validate()` — are skipped; the structural + security gates (type coercion,
  shape normalization, `.sanitize()`, temporal validity, and the url safe-href
  check) always run, so a draft can never persist corrupt or unsafe data.

  Autosaves and draft-status writes use `draft`; anything that lands the entry
  as published or scheduled uses `strict`. Publishing re-validates the **whole**
  promoted bag against the full field list — catching a required field the
  draft left absent, not only one stored empty — and a violation aborts the
  publish with a per-field `CONFLICT` the admin pins onto its inputs. Fields the
  publisher lacks the capability to write are excluded from that gate, so a
  co-author's value can't block an unrelated publish.

  This reverses the previous behavior where autosave rejected incomplete content
  (the recurring "Couldn't save your changes — they may contain invalid content"
  failure while editing) and publish promoted a stored bag without re-checking
  its constraints.

- [#1545](https://github.com/withplumix/plumix/pull/1545) [`8018aba`](https://github.com/withplumix/plumix/commit/8018aba6d6490f466c253206e41f45b0989f38f8) Thanks [@nasyrov](https://github.com/nasyrov)! - Field `.default()` values now seed the entry editor and plain-form meta forms, matching what term, user, and settings forms already do. Opening an entry shows each unset field's default (colors, numbers, selects, JSON, times, …) instead of a blank. Foreign keys the editor doesn't own (e.g. `featuredImage`) are preserved, and defaults are display-only — the form, its `metaRef`, and the autosave diff baseline all seed from the same value, so opening an entry never autosaves a spurious change and editing a field persists only that key, not the untouched defaults.

- [#1543](https://github.com/withplumix/plumix/pull/1543) [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797) Thanks [@nasyrov](https://github.com/nasyrov)! - Entry autosave no longer silently drops meta edits. The editor and plain-form now send only the changed meta keys, so a key the editor doesn't own (e.g. a `featuredImage` written by another plugin) is never re-validated and can't fail the whole write with `meta_not_registered`. The autosave row now accumulates content/excerpt/meta on the existing draft instead of rebasing on the live row on every write, so a partial autosave no longer drops a key an earlier one set — title stays anchored to the live row, which the editor writes it to directly. Both editor debouncers are serialized through one save queue so they can't race the shared optimistic-concurrency token into `409` conflicts, a recovered stale conflict retries once instead of surfacing a failure, and a deletion of an unregistered meta key is now a harmless no-op.

- [#1555](https://github.com/withplumix/plumix/pull/1555) [`9f6a5a8`](https://github.com/withplumix/plumix/commit/9f6a5a8025ba3c1f103473b912f6474045d1f5e5) Thanks [@nasyrov](https://github.com/nasyrov)! - Polish the repeater summary rail and checkbox layout.

  - A repeater's summary row now resolves a `select` / `radio` sub-field's
    stored value to its option label — a collapsed row reads "Card", not the
    raw stored `card`.
  - The summary text truncates with an ellipsis instead of growing the row and
    blowing out the meta panel's width when a heading or option label is long
    (the field's grid cell defaults to `min-width: auto`, so the container now
    sets `min-w-0`).
  - Checkbox fields render label-above like the toggle and the other grid
    fields, so a checkbox sharing a row with text / number inputs lines up on
    the input midline instead of floating at the neighbours' label height.

- [#1553](https://github.com/withplumix/plumix/pull/1553) [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2) Thanks [@nasyrov](https://github.com/nasyrov)! - Polish the repeater row editor and fix a data-loss bug in its summary rail.

  - **New `repeater(...).dialogSize("sm" | "md" | "lg")`** sets the row-editor
    dialog width (`sm:max-w-lg` / `sm:max-w-2xl` / `sm:max-w-4xl`; default `md`).
    Widen it for dense, multi-column rows. Threaded core builder → manifest →
    admin like the existing `.layout()` / `.collapsed()` hints.
  - **Data loss on add / remove / reorder after editing a row is fixed.** The
    summary rail read the parent Controller's snapshot, which doesn't re-render
    when a subfield is edited inside the row dialog; the next structural change
    then committed an array missing the just-edited row's values. It now reads
    the live array via `useWatch`.
  - **Row-editor dialog no longer breaks layout when a field shows a validation
    message** — the grid stretched every sibling cell to the errored field's
    height and vertically centered their controls out of line; cells now
    top-align.
  - **Toggle fields render label-above** like every other grid field, so a
    toggle sharing a row with text / number inputs aligns on the input midline
    instead of floating at the siblings' label height.
  - The summary row's **Edit control is now an icon-only button** (was a
    text button that turned red on error); error state is conveyed solely by the
    warning indicator, and destructive styling is reserved for the remove button.
    Its accessible name is row-numbered ("Edit row 3") so a screen reader can
    tell the rows apart.

- [#1546](https://github.com/withplumix/plumix/pull/1546) [`0b8c1c0`](https://github.com/withplumix/plumix/commit/0b8c1c0bb99b630d58bf7e97690d6a9df4a16814) Thanks [@nasyrov](https://github.com/nasyrov)! - Restore spacing inside settings group cards. The `<form>` wrapper sat between
  the card and its sections, swallowing the card's column gap — so the Save
  button (and the group's fields) collapsed against the last control. The form
  now carries the card's flex column spacing, giving each settings group the same
  header / content / footer rhythm as every other card.

- [#1551](https://github.com/withplumix/plumix/pull/1551) [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a) Thanks [@nasyrov](https://github.com/nasyrov)! - Entries can be created and saved untitled. A new entry is no longer seeded with
  a literal "Untitled" title the author has to delete (typing prepended onto it) —
  `entry.create`'s title is now optional (stored as `""`), `entry.update` accepts
  an empty title (to clear it), and the editor's title field shows a placeholder.

  Read surfaces render a fallback for the empty title: the public `<title>` and
  feeds fall back to the site name / a fixed label, and the admin entry lists,
  dashboard, and command palette show "(no title)" instead of a blank row.

  Also fixes an unset single-select (`appearance: "buttons"`) that could appear to
  highlight its first option when no value is set — it now shows no selection,
  matching the radio control.

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
