# @plumix/blocks

## 0.19.0

### Minor Changes

- [#2106](https://github.com/withplumix/plumix/pull/2106) [`de0f56f`](https://github.com/withplumix/plumix/commit/de0f56ff7a5e96b896c9e4c81ac2f277e873cd9f) Thanks [@nasyrov](https://github.com/nasyrov)! - Removes `analyzeHeadingStructure` and `HeadingAuditViolation` (breaking, pre-1.0).

  The audit outlived its only consumer. It backed `HeadingAuditPanel` in the Puck-era editor, which
  went when that editor did ([#1143](https://github.com/withplumix/plumix/issues/1143)); four days later [#1226](https://github.com/withplumix/plumix/issues/1226) taught it to read headings out of the
  unified rich-text block — keeping working code that no longer had a caller. Nothing has imported it
  since. It was never re-exported from the curated `plumix/blocks` façade either, so reaching it meant
  depending on `@plumix/blocks` directly.

### Patch Changes

- [#2112](https://github.com/withplumix/plumix/pull/2112) [`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes the inline formatting shortcuts never firing. Bold, italic, strikethrough, inline code and
  underline each declared a chord in their mark metadata — and the editor's cheatsheet has been
  listing all five since it shipped — but nothing bound them to the editor, so pressing Cmd/Ctrl+B
  did nothing to the text. The chord a mark advertises is now what the editor binds.

- [#2097](https://github.com/withplumix/plumix/pull/2097) [`a74cf73`](https://github.com/withplumix/plumix/commit/a74cf731f9dd5809f12961bc1ed9a989ab1f9a08) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `useAuth` returning a React element instead of running during the server render. The module
  carried a `"use client"` directive, and the directive marks an _island_ — the SSR pass replaces
  every export of a module carrying one with a shim component — so a theme doing
  `const { user, loading } = useAuth()` read `undefined` for both on the server and rendered its
  signed-out branch with no loading state. The hook now runs on the server, settling to
  `{ user: null, loading: true }` until the client probe resolves, which is what a cache-shared
  anonymous render should say. The build now refuses a first-party `"use client"` module that
  exports a hook-shaped name rather than shimming it; a dependency's own hook exports are left
  alone.

## 0.18.0

## 0.17.0

### Minor Changes

- [#1987](https://github.com/withplumix/plumix/pull/1987) [`2a81bf2`](https://github.com/withplumix/plumix/commit/2a81bf24a2d163e8cc3965770ed9bdae9afd5a2e) Thanks [@nasyrov](https://github.com/nasyrov)! - Social cards take their design from the theme's own tokens. Whatever the theme declared in `tokens`
  is compiled to a `:root` block of custom properties and handed to the renderer ahead of the card's
  own stylesheet, so a card written in ordinary CSS — `var()`, `calc()`, custom properties of its own
  — resolves against the same `--plumix-<category>-<slug>` names the site's CSS reads, and a card
  that redefines a token wins. The same tokens reach both callbacks as resolved values, for what a
  card decides in JavaScript rather than in CSS. Retuning a token lands every card written against it
  on a fresh key, so nothing serves the old palette.

  Adds `emitThemeTokenCss`, `resolveThemeTokens` and the theme-token types to `plumix/blocks`, so
  anything rendering away from the page compiles a theme's tokens without re-spelling the
  custom-property naming rule, and reads the same set it styles with.

  Cards are now addressed over the theme's tokens as well, so the first request for each card after
  this upgrade re-renders it once. The bytes a previous render stored stay in your bucket — as they
  do after any card edit — until you remove them.

### Patch Changes

- [#2037](https://github.com/withplumix/plumix/pull/2037) [`228ef18`](https://github.com/withplumix/plumix/commit/228ef184588c7815a029f51bb764a15de022dde7) Thanks [@nasyrov](https://github.com/nasyrov)! - The bundled default card now paints in the theme's palette. It reads three of the theme's `color`
  tokens — `background` for its ground, `foreground` for the headline, `muted-foreground` for the site
  name beneath it — so a theme spelling its palette those three ways gets a card that looks like the
  rest of the site for declaring nothing: no `ogCards`, no option.

  A theme that names its colours its own way says so once, on the plugin:

  ```ts
  og({
    palette: {
      background: "paper",
      foreground: "ink",
      mutedForeground: "muted",
    },
  });
  ```

  Each key is a role the card paints and each value is one of the theme's `color` slugs. A role left
  out keeps the convention name. Only colour follows the theme: the card's spacing and type sizes are
  its own.

  Resolution is all-or-nothing. A theme naming two of the three keeps the card's own palette entirely
  rather than mixing the two, because the theme's paper under the bundled card's near-white ink is an
  unreadable card — a worse failure than a card that merely looks unlike the site. A token declared
  without a `value` does not resolve either: a card renders away from the page, where the theme's own
  stylesheet never loads, so a custom property the theme's CSS defines is one the card cannot read.

  A theme that declares no tokens renders exactly the card it did before, and a card a theme declares
  is unaffected — it styles itself from the same tokens directly, under whatever names it likes. The
  default card's stylesheet changed shape to carry this, so every stored default card is re-keyed
  once and re-rendered on first request.

  `resolveThemeTokens` now accumulates into null-prototype objects. `SAFE_CSS_TOKEN_RE` admits
  `__proto__`, and on a plain object `resolved.__proto__ ??= {}` reads back `Object.prototype` rather
  than `undefined` — so a theme descriptor carrying a category named `__proto__` wrote that group's
  tokens onto every object in the isolate. Reachable only from a descriptor built from data rather
  than written as a literal, since `__proto__:` in an object literal sets the prototype instead of a
  key, and `defineTheme` validates slugs but never category keys. Resolved groups are null-prototype
  for the same reason: asking whether a slug exists now answers about the theme rather than about
  `Object`.

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

### Patch Changes

- [#1924](https://github.com/withplumix/plumix/pull/1924) [`2f70692`](https://github.com/withplumix/plumix/commit/2f70692410fc65a66e843a4db33170c1ad954dc1) Thanks [@nasyrov](https://github.com/nasyrov)! - Puts a floor under `blocks.htmlAllowlist.extraAttributes` so an override cannot grant a tag an event
  handler or a `style` attribute.

  `extraAttributes` was merged onto the baseline verbatim, with no name ever rejected, so
  `extraAttributes: { p: ["onclick"] }` was enough to render `<p onclick="alert(1)">`. This is the half
  that needed a floor most: `on*` re-opens script execution on any tag that survives the tag denylist,
  `<p>` included, so it needs no element of its own. Handlers are matched by prefix, since the set
  grows with every new event.

  `style` is denied outright rather than sanitized. Trusting a declaration string means parsing
  `prop:val;prop:val` identically in both sanitizer engines, where `sanitizeCssValue` validates a
  single value and the styles pipeline it guards receives CSS as structured property / value pairs.
  `attrs.ts` denies the attribute on the same grounds.

  Attribute names and the tags they hang on must now also be literal — `[a-z][a-z0-9-]*`, the rule
  `attrs.ts` already applies to author-supplied attributes. sanitize-html reads an attribute entry as a
  glob and a `"*"` tag key as every tag, so `{ "*": ["*"] }` handed back every name the floor rejects
  and `"*click"` walked past the prefix test outright. The DOMPurify shim matches both exactly and
  expands neither, so those configs sanitized clean in the editor and dirty on the server; refusing the
  shape closes the hole and the divergence together. An override that spelled an attribute as a glob
  never worked in the editor and now works nowhere.

  Names are lowercased before the check, as tag names already were. Both engines honoured a handler
  that reached them, and the mixed-case spelling was honoured in the editor alone: DOMPurify lowercases
  its allowlist while sanitize-html compares the parsed name against it verbatim.

  Nothing was exploitable: a site had to opt in through `blocks.htmlAllowlist`, and that override
  reached no renderer at the time. It reaches both as of this same release, which is why this floor —
  the last of the three — lands first.

- [#1929](https://github.com/withplumix/plumix/pull/1929) [`b2b6510`](https://github.com/withplumix/plumix/commit/b2b6510460703249f17dcd0ba676dab3b7ef2caa) Thanks [@nasyrov](https://github.com/nasyrov)! - Narrows the two user-meta bags on the public surface to `JsonObject`, and gives the framework's
  remaining open dictionaries names.

  `AuthenticatedUser.meta` and its `@plumix/blocks` mirror `RendererUser.meta` were
  `Record<string, unknown>`. Both are the `users.meta` column read straight off the row, and that
  column has been `JsonObject` since the storage migration — the projection just never followed. A
  custom `RequestAuthenticator` that builds an `AuthenticatedUser` from a bag typed
  `Record<string, unknown>` now has to say `JsonObject`; reading `ctx.user.meta` is unaffected.

  Everything else here is a rename. The bags that are genuinely not serialized data — logger metadata,
  a settings group, a drizzle schema module, the Vite config passthrough, a template's resolved deps,
  island props, the block context's entry and site settings — are now named types (`LogMeta`,
  `SettingsBag`, `SchemaModule`, `ViteUserConfig`, `LoadedTemplateDeps`, `SerializedProps`,
  `HydratedEntry`, `SiteSettings`, and others), each declared once with a note saying what puts a
  non-serializable value in it. The types they alias are unchanged, so existing annotations keep
  compiling.

  This is the contract step of the JSON dictionary migration: a new `plumix/no-unsafe-dictionary` lint
  rule now rejects `Record<string, unknown>` written inline, so "JSON nobody has parsed" and "a bag
  that is open by design" can no longer share a spelling.

- [#1927](https://github.com/withplumix/plumix/pull/1927) [`1b97c01`](https://github.com/withplumix/plumix/commit/1b97c01a99828538110e1cefd60dbcff3828c92f) Thanks [@nasyrov](https://github.com/nasyrov)! - Moves the raw-HTML floors from `buildHtmlAllowlist` into `sanitizeHtml`, so they hold for any
  allowlist that reaches the renderer.

  The three floors — denied tags, denied attributes, denied schemes — sat in the builder, which is not
  the only way an allowlist arrives. `HtmlAllowlistProvider` and the `HtmlAllowlist` type are both
  public, and `core/html` and `core/rich-text` sanitize against whatever the provider carries, so a
  theme mounting a hand-built allowlist got no floor at all:

  ```tsx
  <HtmlAllowlistProvider value={{ allowedTags: ["script"], ... }}>
  ```

  `sanitizeHtml` is the one call every render passes through, builder or not, and it now narrows the
  allowlist it is handed before either engine sees it. The floors and the pass that applies them live
  in `html/floors.ts`, which both sides share.

  Canonicalizing moved with them, which is what makes the floor hold rather than merely relocate.
  Lowercasing used to happen in the builder, so `allowedTags: ["IFRAME"]` through the provider passed a
  denylist keyed on lowercase names — inert under sanitize-html, which lowercases the parsed tag and
  matches the list verbatim, but live under the DOMPurify shim, which lowercases its list instead.
  `enforceHtmlFloors` now lowercases and dedupes before it filters, and `buildHtmlAllowlist` is left
  merging an operator's override and nothing else.

  No config behaviour changes: an allowlist that was already clean comes back identical, which the
  baseline and everything the builder produces both are.

- [#1931](https://github.com/withplumix/plumix/pull/1931) [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900) Thanks [@nasyrov](https://github.com/nasyrov)! - Wires `blocks.htmlAllowlist` through to the renderer. All four of its fields — `extraTags`,
  `extraAttributes`, `schemes`, `allowProtocolRelative` — now change what `core/html` and
  `core/rich-text` render, on the public page and in the editor canvas.

  The allowlist was typed, documented, and built at boot, but nothing mounted `HtmlAllowlistProvider`,
  so every render fell back to the context default — the baseline. Setting
  `htmlAllowlist: { extraTags: ["img"] }` produced silence, not an image.

  `HtmlAllowlistProvider` is the seam, mounted in both consumers. The public render mounts it from
  `renderEnv.htmlAllowlist`, alongside the existing `PlumixProvider`. The editor canvas is a fresh
  React tree inside an iframe with no server context, so the allowlist crosses the boundary the way
  tokens and breakpoints already did: on the JSON embed the SSR emits next to the mount root, read back
  at mount. Without that second mount the canvas would keep sanitizing against the baseline while the
  published page used the operator's list, and an author would see their markup stripped in the editor
  and intact on the site.

  That embed is now `[data-plumix-render-env]` rather than `[data-plumix-style-env]` — it carries more
  than styles. Nothing outside the editor runtime reads it, and the SSR and the runtime that reads it
  ship together.

  This lands alongside the three floor changesets in the same release: the denials in
  `enforceHtmlFloors` are what an override cannot widen past, and they went in before anything could
  reach the renderer through them.

  `PlumixApp.htmlAllowlist` documented the missing step as `<EntryContent htmlAllowlist={...}>`.
  `EntryContent` is an interface, not a component, so that seam never existed and could not be
  followed; the field now describes the provider.

- [#1919](https://github.com/withplumix/plumix/pull/1919) [`efe3834`](https://github.com/withplumix/plumix/commit/efe3834bebb073105d6912152091627cce700a63) Thanks [@nasyrov](https://github.com/nasyrov)! - Puts a floor under `blocks.htmlAllowlist.schemes` so an override cannot re-admit a script-capable URL
  scheme.

  `schemes` replaces the baseline instead of extending it — deliberately, since `schemes: []` is how an
  operator locks the surface down — but nothing bounded the replacement in the other direction, so
  `schemes: ["javascript"]` was enough to make `<a href="javascript:alert(1)">` survive sanitizing on
  the server. No tag the baseline does not already allow is needed for that. `javascript`, `vbscript`,
  `data`, `blob` and `view-source` are now dropped from the built allowlist whatever the config says —
  the schemes `renderer/link.tsx` refuses to make clickable, plus the wrapper they hide behind.

  Two operator-visible consequences. Override schemes are now lowercased, which makes the two sanitizer
  engines agree: `sanitize-html` compares the list verbatim while the DOMPurify shim the browser build
  uses lowercases it, so `schemes: ["HTTPS"]` used to drop every link on the server and render fine in
  the editor. Config that previously failed closed this way now takes effect. And an override that
  listed `data` to inline data-URI images loses them — that setup only ever half-worked, since
  DOMPurify strips `data:` on its own regardless, so the images rendered on the server and vanished in
  the editor. Per-attribute scheme scoping is the shape of a fix there, not a hole in the floor.

  Nothing was exploitable in the editor: DOMPurify rejects the dangerous schemes on its own URI regexp
  whatever the allowlist says. Nor in production — a site had to opt in through `blocks.htmlAllowlist`,
  and that override reached no renderer at the time. It reaches both as of this same release, which is
  why the floor lands first.

## 0.15.0

### Minor Changes

- [#1897](https://github.com/withplumix/plumix/pull/1897) [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the stored block tree and the plugin dictionaries that describe serialized data with the public `JsonObject` / `JsonValue` types.

  **Source-breaking for block and theme authors** on the type level only — the emitted JS is unchanged. `BlockNode` is now a `type` alias rather than an `interface`, and its `attrs` is a `JsonObject`; the same goes for `BlockVariation.attrs`, `BlockSpec.defaults`, a transform's `mapAttrs`, a block loader's `attrs`, and `ResponsiveStyleSlot` / `VisibilityFlags`. A node built from a `Record<string, unknown>` no longer assigns, and an entry added to `BlockTypeRegistry` has to be spelled as a `type` over an object literal — TypeScript withholds the implicit index signature an `interface` would need.

  What a block's `render` receives is deliberately _not_ JSON and is now named and exported: `MaterializedAttrs` is the stored bag with each slot key replaced by the component that renders that slot's children. `BlockNodeRenderProps`, `BlockNodeComponent` and `BlockSpec` default their `Attrs` parameter to it.

  **Source-breaking for the editor's plugin-field seam.** `@plumix/admin-editor`'s `PluginFieldControlProps` now types `rhf.onChange` as `(next: JsonValue) => void` and the sibling block `attrs` as a `JsonObject`; `rhf.value` stays `unknown`, because the same controls also serve metaboxes, where RHF hands over a live `Date` for a temporal field. The `registerPluginFieldType` registry contract itself is unchanged.

  `@plumix/plugin-audit-log` holds a caller's own `properties` to JSON: `ctx.audit.log({ properties })` and an event definition's `extra` return no longer accept a `Date`, which reached storage as an ISO string anyway. The row's stored envelope stays open — its diff half is built from live entity columns.

  Island props keep their open type — the prop codec encodes `Date`, `Map`, `Set`, `BigInt`, `URL` and the typed arrays so they survive hydration, which a JSON type would deny.

  `@plumix/runtime-cloudflare` types the CF Access JWT payload as jose's `JWTPayload` instead of a loose dictionary.

- [#1894](https://github.com/withplumix/plumix/pull/1894) [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the returns that were left `unknown`. A function declaring a return type of `unknown` — or a
  promise of one — is now rejected in production source by `plumix/no-unknown-return`, and the
  signatures it found say what they hand back.

  **Source-breaking for plugin authors** on the type level. Three sites also emit different JS, each
  noted below.

  - The `.sanitize()` callback on the `json()` and `entry()`/`term()`/`user()` reference builders, on
    `media()`, and on a hand-written `MetaBoxField` object returns `JsonValue`. The value is written
    to a JSON column, so this is what the write path already required — a callback returning a `Date`
    reached the driver as whatever `JSON.stringify` made of it. The typed builders (string, color,
    link, number, range, select, temporal, toggle) still take
    `(value: NonNullable<V>) => NonNullable<V>` and are unaffected for callers.
  - `LinkValue` is a `type` alias rather than an `interface`, so a link value assigns to `JsonObject`
    (TypeScript withholds the implicit index signature from an interface).
  - A telemetry record's `data` is `JsonValue`, and `TelemetryCollector.record` takes
    `JsonValue | (() => JsonValue)` — matching `TelemetrySpanHandle.set`, which already did. The
    debug bar still sanitizes at read time, since nothing checks the type at runtime.
  - The read-error mappers (`toRpcEntryReadError`, `toRpcTermReadError`) return `Error | undefined`
    instead of passing a foreign error through: `undefined` means "not mine to translate", and the
    caller rethrows what it caught. This removes a latent `throw undefined` on an unrecognized error
    code.

  One further behaviour change, in a forgiving-read fallback: a meta value stored as an object or
  array under a field since narrowed to `string` now reads back as its JSON rather than as
  `"[object Object]"` or `"a,b"`.

- [#1889](https://github.com/withplumix/plumix/pull/1889) [`82fa032`](https://github.com/withplumix/plumix/commit/82fa0323aada1c0c37e17261a4d2c62f7b585584) Thanks [@nasyrov](https://github.com/nasyrov)! - Registers `core/html` with the rest of `coreBlocks`, so the raw-HTML block appears in the inserter
  and renders without a site installing it by hand.

  It was held out of `coreBlocks` when it had no sanitizer, on the understanding that a site wanting
  the escape hatch would register it explicitly. That route stopped working: block registration rejects
  any name in the reserved `core/` namespace, so neither a theme's `blocks` field nor a plugin's
  `registerBlock` would take it, and the block shipped unreachable. The reason for holding it back is
  also gone — it renders through `sanitizeHtml`, the same path `core/rich-text` already takes, so it
  adds no rendering surface a site did not already have.

  What survives sanitizing is the baseline allowlist: text-level markup and `http`/`https`/`mailto`/
  `tel` anchors. `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `form`,
  `input`, `textarea`, `button`, `svg` and `math` are denied outright and stay denied whatever a site
  configures. Others, `img` among them, are simply absent from the baseline and can be added.

  Two caveats worth knowing. There is no per-block disable, so a site that would rather not offer a
  raw-HTML block has no switch for it. And `blocks.htmlAllowlist` does not currently reach the
  renderer at all — everything sanitizes against the baseline until that is wired up.

- [#1898](https://github.com/withplumix/plumix/pull/1898) [`482b4e6`](https://github.com/withplumix/plumix/commit/482b4e697cbf6b2f014e712315050f474f502fe0) Thanks [@nasyrov](https://github.com/nasyrov)! - `core/rich-text` no longer surfaces a React-element `body` verbatim — that branch predated the
  current editor and bypassed `sanitizeHtml`. An element body now takes the same fallback as any
  other non-string value and renders an empty `<div>`.

### Patch Changes

- [#1899](https://github.com/withplumix/plumix/pull/1899) [`fdd72b8`](https://github.com/withplumix/plumix/commit/fdd72b89167237d25bc3ced465e0d2543c37b40b) Thanks [@nasyrov](https://github.com/nasyrov)! - Denies the parser context-switching tags in the raw-HTML allowlist, and matches the denylist
  case-insensitively.

  `HARD_DENYLIST` is what keeps `blocks.htmlAllowlist` from re-opening a surface the baseline closes.
  It covered the elements that execute, navigate or load a subresource, and `svg` and `math` for
  switching the parser into foreign content — but not the rest of that second family: `noscript`,
  `template`, `title`, `xmp`, `noembed`, `noframes`, `plaintext` and `annotation-xml`. Sanitized output
  is re-parsed, since `core/html` and `core/rich-text` both hand it to `dangerouslySetInnerHTML`, and a
  tag whose children are raw text on the sanitizer's pass and markup on the browser's is the
  mutation-XSS shape — which is why `svg` and `math` were listed to begin with. `frame`, `frameset` and
  `applet` join the first family for the same reason its other members are there.

  The list was also compared verbatim, so `extraTags: ["IFRAME"]` passed the check. That was inert
  under `sanitize-html` on the server, which lowercases parsed tag names before matching, but the
  browser build sanitizes through DOMPurify, which lowercases the allowlist instead — so the mixed-case
  spelling was honoured there. Override tags and `extraAttributes` keys are now lowercased before the
  check.

  Nothing was exploitable: a site had to opt in through `blocks.htmlAllowlist`, and that override does
  not reach the renderer yet. This closes the gaps before it is wired up.

## 0.14.0

## 0.13.0

### Minor Changes

- [#1747](https://github.com/withplumix/plumix/pull/1747) [`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `useAuth()` client hook for themes.

  A theme island can now read the current visitor client-side and hydrate
  personalization — a user menu, a signed-in greeting — on a page whose HTML was
  served from the shared edge cache:

  ```tsx
  import { useAuth } from "plumix/blocks/renderer";

  function UserMenu() {
    const { user, loading } = useAuth();
    if (loading) return null;
    return user ? <AccountMenu user={user} /> : <SignInLink />;
  }
  ```

  The hook POSTs to the existing `auth.session` RPC — the same whoami the admin
  boots from, so there is one source of truth and no new endpoint. It fails closed:
  an aborted, offline, or error response resolves to the signed-out state
  (`user: null`) rather than throwing.

  The islands bootstrap script now carries a `data-plumix-base-path` marker so the
  hook reaches the RPC endpoint under a subdirectory mount, where a hydrated island
  has no provider context to read the base path from.

## 0.12.0

### Minor Changes

- [#1730](https://github.com/withplumix/plumix/pull/1730) [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a) Thanks [@nasyrov](https://github.com/nasyrov)! - Add optional per-entry-type scoping for editor blocks.

  Blocks registered via `ctx.registerBlock` were global — offered in every entry
  type's inserter — and the only lever was `inserter: false`, which hides a block
  from _every_ palette. There was no way to offer a block for one entry type and
  nowhere else.

  A block spec can now declare an optional `entryTypes` allow-list:

  ```ts
  defineBlock({ name: "eduscope/hero", entryTypes: ["school"], render });
  ```

  Unset = every type (the unchanged default, so nothing changes for existing
  blocks); set = the block appears only in those entry types' inserters, and is
  hidden when the entry type doesn't match or is unknown. This mirrors the existing
  `PatternSpec.entryTypes` scoping. It constrains only the editor's
  available-blocks palette — the render registry stays global and save-time
  validation is untouched, so a block already stored on an entry still renders and
  still validates regardless of the type it lives on.

### Patch Changes

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

## 0.11.0

### Minor Changes

- [#1670](https://github.com/withplumix/plumix/pull/1670) [`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef) Thanks [@nasyrov](https://github.com/nasyrov)! - Flag island hydration mismatches in development.

  In `plumix dev`, a hydrating island now mounts with React `hydrateRoot` instead
  of `createRoot`, so a non-deterministic render — a `Date.now()`, `Math.random()`,
  or locale read that differs between the Worker SSR pass and the browser — no
  longer fails silently. React recovers by client-rendering the subtree (no crash)
  and reports the divergence, which the renderer dispatches as a
  `plumix:island-hydration-mismatch` event carrying the island element and React's
  component stack. The dev island-error overlay renders it through the shared
  dev-error page, named and labeled by the island's component, so the offending
  island is flagged by name.

  Production is unchanged, byte-for-byte: the `hydrateRoot` swap and the whole
  diagnostic stay gated on `process.env.PLUMIX_DEV` and tree-shake out of
  production island bundles, where every island keeps mounting with `createRoot`.
  A `client="only"` island ships no server output, so it also keeps mounting fresh
  with `createRoot` and is never reported as a mismatch.

- [#1672](https://github.com/withplumix/plumix/pull/1672) [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b) Thanks [@nasyrov](https://github.com/nasyrov)! - Show _what_ diverged on an island hydration mismatch, not just that it did.

  When a dev-hydrating island's server and client renders disagree, the renderer
  now captures the island's own HTML at two points — before `hydrateRoot` (the
  server render) and after React's recovery re-render (the client render) — and
  carries both on the `plumix:island-hydration-mismatch` signal. The shared
  resolved-error contract (`DevErrorInfo`) gains one optional `hydrationDiff`
  field for that server/client pair, and the dev-error page renders a
  server-vs-client diff section when it is present — leading, above the raw
  component stack — so the developer sees the exact markup that changed. Both
  captured strings render as escaped text, never re-parsed.

  Surfaces that do not set the field are unchanged: an SSR error, an island
  component throw, or a mismatch with no captured pair renders exactly as before.
  Production stays untouched — the capture lives inside the existing
  `process.env.PLUMIX_DEV` branch and tree-shakes out.

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

## 0.9.0

### Minor Changes

- [#1649](https://github.com/withplumix/plumix/pull/1649) [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins contribute panels to the `plumix dev` error page.

  The dev error page already shows fixed request / route / database / timeline /
  application context below the stack. A plugin can now add its own section
  through a new dev-only `error_page:panels` filter, mirroring how it contributes
  to the debug bar via `debug_bar:panels`:

  ```ts
  "error_page:panels": (
    panels: readonly DevErrorPanel[],
    error: unknown,
    ctx: AppContext,
  ) => readonly DevErrorPanel[];
  ```

  Each `DevErrorPanel` is `{ id, title, order?, render }`, where `render(error,
ctx)` returns a `ReactNode` over the caught value and the live request context —
  the same pair the `error_page:hints` filter receives. Core collects the filter
  `applyFilterIsolated`-safe, dedupes by id (last wins), orders by ascending
  `order`, and renders each panel in its own isolated SSR pass, so a throwing
  subscriber or a panel that throws from `render` degrades to a notice rather than
  crashing the very page meant to surface the error. Contributed panels appear as
  their own sections below the built-in context.

  Core registers none of its own — its built-in sections cover the common case —
  so this filter is purely the plugin-facing panel API. The whole surface stays
  behind the `PLUMIX_DEV` gate and tree-shakes out of production builds.

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

- [#1618](https://github.com/withplumix/plumix/pull/1618) [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only client island error overlay.

  When an island fails in `plumix dev` — during hydration, after hydration (a
  render/effect throw, captured with its React component stack), or via an async
  error or unhandled rejection — a small, non-blocking indicator now appears in
  the bottom-left corner. Clicking it opens a centered modal (the Next.js
  dev-overlay shape) showing the message, the component stack, and the stack
  trace, rendered through the shared dev error renderer inside a Shadow DOM root
  so a broken theme can't style it; the close button, Escape, or a backdrop click
  returns to the indicator, and the page stays visible behind. A failing island no
  longer breaks the rest of the page or the other islands; multiple errors are
  counted and navigable. Everything stays gated on `process.env.PLUMIX_DEV` and
  tree-shakes out of production island bundles.

- [#1609](https://github.com/withplumix/plumix/pull/1609) [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d) Thanks [@nasyrov](https://github.com/nasyrov)! - Show actionable "how to fix" hints on the `plumix dev` error page.

  When a recognized error reaches the dev error page, it now surfaces a prominent
  "how to fix" card above the stack. Core matches its own typed errors (e.g.
  `ThemeRegistrationError`) and a curated set of common untyped pitfalls — a D1
  `no such table` points at `plumix migrate`, a missing secret points at
  `.dev.vars`, a missing binding points at `wrangler.jsonc`. Unrecognized errors
  render no card.

  Hints are contributed through a new dev-only `error_page:hints` filter that
  mirrors `debug_bar:panels`: it runs on every dev 5xx with the caught error and
  request context, and plugins subscribe to add or override hints. The shared
  renderer at `@plumix/blocks/dev-error` gains the `DevErrorHint` shape and renders
  the cards. Everything stays gated on `process.env.PLUMIX_DEV` and tree-shakes out
  of production.

- [#1613](https://github.com/withplumix/plumix/pull/1613) [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35) Thanks [@nasyrov](https://github.com/nasyrov)! - Make a throwing block loader dev-fatal in `plumix dev`, naming the block.

  When a block's SSR loader rejects during development, the page now fails to the
  dev error page — naming the culprit block and surfacing the loader's own
  message and the failing query — instead of silently dropping that block from
  the render. In production the same rejection stays isolated to the block
  (degrading to its `errorFallback`, or nothing) and the page still renders, so
  the resilience contract is unchanged.

  The render path captures the first loader rejection and, behind the
  `process.env.PLUMIX_DEV` gate, throws a new `BlockLoaderError` (exported from
  `@plumix/blocks`) that propagates to the dispatcher catch. The wrapper names the
  block and loader key, carries the underlying message so error-page hints keep
  matching through the loader boundary, preserves the original via `cause`, and
  adopts its stack so frames resolve to the failure site. The gate tree-shakes the
  escalation out of production builds.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1606](https://github.com/withplumix/plumix/pull/1606) [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only error page for render throws in `plumix dev`.

  When a theme template throws during render in development, the visitor now gets
  a self-contained, theme-independent 500 page showing the exception name,
  message, and raw stack — instead of re-rendering the failure through the theme
  (which blanks the screen when the theme itself is the culprit). The page is a
  shared, zero-JS renderer exposed at `@plumix/blocks/dev-error` and SSR'd by core
  at the dispatcher catch. It is gated on `process.env.PLUMIX_DEV`, so the page
  and its styles tree-shake out of production builds — the existing themed 500 is
  unchanged.

- [#1608](https://github.com/withplumix/plumix/pull/1608) [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve dev error-page stack frames to original source with a code excerpt.

  The `plumix dev` error page now parses the (already-sourcemapped) stack into
  frames showing each original `file:line`, with application frames expanded and
  framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
  source excerpt with the offending line highlighted — lazy-fetched from a new
  dev-only source resolver mounted as a Vite middleware, so the worker (which has
  no filesystem) never reads source itself. Paths are shown relative to the
  project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
  and tree-shakes out of production.

- [#1619](https://github.com/withplumix/plumix/pull/1619) [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve the client island error overlay's stack to original source frames.

  The dev island error overlay now shows the same frame view as the server error
  page instead of a raw browser stack: each frame's original `file:line` (with the
  project base path stripped), application frames expanded and framework frames
  collapsed behind a toggle, and clicking a frame reveals its source excerpt with
  the offending line highlighted.

  Browser stacks carry transformed positions pointing at Vite's served module
  URLs, so a new dev-only Node resolver POSTs the raw stack, maps each frame back
  through the dev server's per-module sourcemaps, and returns the resolved frames.
  The overlay's indicator is now a compact count badge, the modal gives the code
  excerpt the room (a ~30/70 split), long frame names truncate, and the React
  component stack is shown only as a fallback when no frames resolve. Everything
  stays dev-only and gated on `process.env.PLUMIX_DEV`.

### Patch Changes

- [#1620](https://github.com/withplumix/plumix/pull/1620) [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a) Thanks [@nasyrov](https://github.com/nasyrov)! - Give the dev error page's stack frame rows a little more vertical breathing room
  between the function name and its file location.

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

### Minor Changes

- [#1471](https://github.com/withplumix/plumix/pull/1471) [`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e) Thanks [@nasyrov](https://github.com/nasyrov)! - Add author archives end-to-end: `/authors/{slug}` renders a paginated list of a given author's published entries, themeable like any other archive.

  The full seam is wired: a new `author` `RouteIntent`, framework routes for `/authors/:slug` (+ `/page/:n`), a `resolveAuthor` resolver (the author's published, public-type entries — unknown slug or out-of-range page → 404), an `author` `ResolvedNode`, a generic `author()` template tier, a `forAuthor(slug)` / `forAuthor(id)` targeted builder, and a typed `AuthorArchiveData { author; entries; pagination }`. An author RSS/Atom feed is served at `/authors/{slug}/feed`, and author-archive pages advertise it via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      author(AuthorArchive), // every author archive
      forAuthor().slug("jane").template(JaneArchive), // one author, by slug
      forAuthor().id(1).template(FounderArchive), // or by id
    ],
  });
  ```

  Authors are addressed by a new **`users.slug`** column (globally unique, mirroring `terms.slug` / `entries.slug`). It is derived from the user's name via `slugify` at creation — falling back to `user`, de-duplicated with a numeric suffix (`jane`, `jane-1`, `jane-2`), and never derived from the email — and is stable across later name changes. `ResolvedAuthor` now carries `slug`, so `data.author` / `entry.author` can link to an author archive.

## 0.3.0

## 0.2.0

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1
