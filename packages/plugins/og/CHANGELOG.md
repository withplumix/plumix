# @plumix/plugin-og

## 0.2.1

### Patch Changes

- [#2089](https://github.com/withplumix/plumix/pull/2089) [`33af961`](https://github.com/withplumix/plumix/commit/33af9610dd56eaf962abb18c8a767348a5b2bee9) Thanks [@nasyrov](https://github.com/nasyrov)! - Pins the card renderer to an exact `@takumi-rs/wasm` version instead of a caret range. A range let a
  site install a release this package's raster tests had never rendered with — a break that surfaces
  as a wrong unfurl weeks later rather than as an error. Nobody moves version: the pin names what the
  caret already resolved to, so an existing install is byte-identical.

- [#2076](https://github.com/withplumix/plumix/pull/2076) [`022401e`](https://github.com/withplumix/plumix/commit/022401e1b77978bfe0d97cde5213609823f67329) Thanks [@nasyrov](https://github.com/nasyrov)! - Carries `storedMeta` on the dev-preview sample entry and term, following the field core's
  `ResolvedEntry` / `ResolvedTerm` gained so `.whereMeta()` compares against the stored meta bag.

## 0.2.0

### Minor Changes

- [#2045](https://github.com/withplumix/plumix/pull/2045) [`f50a4b9`](https://github.com/withplumix/plumix/commit/f50a4b9d210cf158f2eff6368696f614d27c9435) Thanks [@nasyrov](https://github.com/nasyrov)! - **Breaking.** Core no longer emits head meta. The description, the robots directive, the Open Graph
  set, the Twitter card and the resolved social image now come from `@plumix/plugin-seo`; core keeps
  the canonical URL, its `<link rel="canonical">` and the redirect that normalizes to it.

  The boundary is drawn on consequence rather than on topic: core owns what would be _wrong_ without
  a plugin installed, a plugin owns what would merely be _absent_. A canonical URL core redirects to
  but never declares is a site contradicting itself. A missing description is a site that has not
  opted in.

  To keep today's head, install the plugin and add it to the config:

  ```ts
  import { seo } from "@plumix/plugin-seo";

  export default plumix({ plugins: [seo()] });
  ```

  The plugin reproduces every tag core emitted and adds three it did not: `article:published_time`,
  `article:modified_time` and `article:author` on an entry page. Contributions go through the existing
  `render:document` filter and are gap-filled, and they run last on that chain whatever order the
  `plugins` array is in — so a theme's own head tags keep winning exactly as they did, and so do
  another plugin's.

  The `seo:og_image` filter and the chain it sits in move to the plugin unchanged — an author's
  explicit `.ogImage()` choice, then a subscriber's image, then the entry's `.featured()` photo, then
  the site default, in that order however the `plugins` array is written. `@plumix/plugin-og`
  contributes one link of it and now needs `@plumix/plugin-seo` installed to reach a page's head.

  The site-wide indexing toggle and the default social image move out of core's Site identity settings
  into the plugin's own group. A site upgrading keeps both answers with no migration step: the plugin
  reads its group first and falls back to the legacy `site.public` and `site.default_og_image` rows,
  and the settings form is seeded from the same fallback so the next save writes them through.

  Fixes a latent crash the move surfaced: `applyFilter` isolates each handler by structured-cloning
  the value, which throws outright on a payload carrying a function. A document manifest carries one
  whenever a theme writes `titleTemplate` as a callback, so any `render:document` subscriber took the
  page down on such a theme — nothing had one until now. A payload that cannot be cloned is handed
  over as it stands; isolation is what it loses, not the render.

  Core also gains two exports and one filter argument. `canonicalUrl` names the page the same way
  core's own redirect does. `loadSettingsGroups` reads any settings group through the request memo
  the template dep already uses, so a plugin joins that read instead of querying the table itself.
  And `render:document` now receives the title core resolved for the page — an entry's expanded
  title, an archive's label, a plugin archive's own — which a subscriber cannot derive, since the
  per-page-kind logic is core's and a `registerArchiveType` title is known only to the resolver that
  returned it. The argument is additive: an existing three-parameter subscriber is unaffected.

### Patch Changes

- [#2054](https://github.com/withplumix/plumix/pull/2054) [`f28dfe3`](https://github.com/withplumix/plumix/commit/f28dfe3fa0012e26ddb68a63405b3321bd7b85c9) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `previewableEntry`, so a plugin building an editor-side preview does not hand-roll its own
  authorization gate. It loads an entry by id, rejects a type outside the calling procedure's
  allowlist as `NOT_FOUND`, gates on `edit_any` or author-plus-`edit_own`, and overlays the caller's
  pending autosave onto the row's content, excerpt and meta.

  The gate is the editor's own rather than the read gate a published entry would pass for anyone,
  because a preview carries the entry's title and excerpt and a draft's are not public yet. The
  allowlist is load-bearing: unlike `entry.get`, the gate does not re-check `read` or reject reserved
  types, so a caller must pass its own registered types rather than a wide or user-supplied list.

  `@plumix/plugin-og` and `@plumix/plugin-seo` now share this one implementation instead of carrying
  a copy each. Neither plugin's behaviour changes.

## 0.1.0

### Minor Changes

- [#2039](https://github.com/withplumix/plumix/pull/2039) [`db7cdba`](https://github.com/withplumix/plumix/commit/db7cdbaaaec94601ff4f630559ccb0d01bfde33f) Thanks [@nasyrov](https://github.com/nasyrov)! - Puts a second gate in front of every development-only surface. `PLUMIX_DEV` says a dev server is
  running; it says nothing about who reached it, and `plumix dev` is routinely reachable from off-box
  — a tunnel opened to test a webhook, a container bound to `0.0.0.0`, a forwarded codespace port.
  Core now also requires the request to have arrived over loopback before it injects the debug bar,
  serves `/_plumix/debug/requests`, or renders the dev error page, and the Vite plugin applies the
  same rule to the dev endpoints that answer ahead of the worker — the source-excerpt reader behind
  the error page's frames, the two sourcemap resolvers, and the browser-errors-to-terminal sink.
  Off-loopback each is absent rather than refused: no bar in the markup, a 404 on the history, and
  the theme's own `server-error` page in place of the dev one. What is withheld is the disclosure,
  not the site.

  Adds `auth: "development"` to the plugin route model, so a route that exists only while you are
  developing declares that rather than `auth: "public"` and inherits the same two gates. It answers
  404 off-loopback, since the existence of the route is itself development detail. The OG plugin's
  card preview takes it — the surface that motivated the change, since it runs a theme-authored
  `render` and resolves whatever template deps the card declared against a request carrying no
  session. `registerRestResource` keeps the narrower `RestResourceAuth`: a REST resource is part of
  the documented public API and has nowhere to publish a dev-only gate.

  `PLUMIX_DEV_ALLOW_REMOTE=1` is the deliberate opt-out, for reviewing on a phone, demoing through a
  tunnel or working in a codespace. Like the other dev-only variables it is substituted at bundle
  time and empty in a production build, so it cannot follow you to a deploy. The MCP endpoint keeps
  its own stricter gate — off-loopback it falls back to bearer-token authentication rather than
  closing, so the opt-out has nothing to open there.

- [#1990](https://github.com/withplumix/plumix/pull/1990) [`526e715`](https://github.com/withplumix/plumix/commit/526e715a84150363a2558507b4bcf72e3e111788) Thanks [@nasyrov](https://github.com/nasyrov)! - Cards can paint images, and the renderer never fetches one. A card's tree takes `image` nodes, and
  the plugin resolves every `src` itself before the render: media the site's storage addresses
  directly, media the `/_plumix/media/serve/<id>` route proxies from a private bucket, and `data:`
  URIs, which pass through carrying their own bytes. Anything else is dropped, not fetched — the
  bytes reach the renderer already resolved, so there is no code path from a card to an outbound
  request, and no render option is ever read from the card's URL.

  Resolving is not the same as accepting: an object over 8 MB or one whose stored content type is not
  an image is dropped too, since the engine throws on bytes it cannot decode and a card should lose
  one image rather than its whole render.

  That removes the class of problem behind three advisories in the equivalent Nuxt module rather than
  mitigating it, and it keeps a render deterministic: no network on the render path means no timeouts
  and no half-drawn cards.

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

- [#2036](https://github.com/withplumix/plumix/pull/2036) [`f169434`](https://github.com/withplumix/plumix/commit/f1694341ec80ac99e9f31243605f35fbb7c6f823) Thanks [@nasyrov](https://github.com/nasyrov)! - The bundled default card now covers every page kind core routes, not just entries. Install the
  plugin, configure nothing, and a term archive, a content-type archive, an author archive, a date
  archive and the front page each get a card — the page's own title over the site's name, and on the
  front page the site's name over its tagline. A card a theme declares still outranks it.

  Cards moved to `/_plumix/og/card/<target>/<digest>.<ext>`, where `<target>` names the page:
  `entry/12`, `term/3`, `archive/post`, `author/7`, `date/2026-03`, `front-page`. One route mount
  serves all of them, so the kind is a path segment rather than a route of its own. The digest-less
  pointer is unchanged in behaviour — `/_plumix/og/card/term/3.png` redirects to whichever render is
  current.

  A listing page is shareable when it lists at least one published entry, and answers `404` when it
  does not — the same way the entry route answers for a draft. That rule is what keeps a card from
  being minted for every date in the calendar, and keeps `author/<id>` from being a walk through the
  user roster on a site where nobody has published. The front page is the exception: it is the site,
  so it is shareable whether or not anything is on it yet. A search page and a `registerArchiveType`
  archive get no card at all — neither can be named by an identity a URL could carry.

  A content-type archive is asked one thing more: whether an anonymous visitor may read it.
  `policyForMatch` resolves an `archive` intent against the entry type's `access.default`, so a type
  whose listing page redirects a signed-out visitor to sign-in now gets no card either — the same
  question the entry route already asked, on the page kind that can also carry other entries' titles.

  A card names the archive rather than one paginated slice of it. `/posts/page/2` advertises the same
  card `/posts` does: the route only ever renders an archive's first page, so the head resolves that
  page too rather than digesting a slice the route will not serve.

  `resolveListingPage` is a new core export: it resolves the front page, an archive, a term, an
  author or a date archive from its identity rather than from a URL, returning the node and the data
  that page's own template would receive. The card route reads through it, so a card is rendered from
  the same query the page is — filters included — rather than from a second copy of it. Public
  date-archive routes now answer one `x-plumix-hint` (`public-date-not-found`) where they answered
  two, since an unparsable date and a page past the end of a real one are one missing page.

- [#2005](https://github.com/withplumix/plumix/pull/2005) [`7bbef7c`](https://github.com/withplumix/plumix/commit/7bbef7c47a4ddb2162daf215f25b9dadf1ea3125) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds two development-only surfaces to the OG plugin. `/_plumix/og/preview` renders every declared
  card rule against sample data, one card per rule at `/_plumix/og/preview/<n>.<ext>`, listed in the
  order a page resolves against them rather than the order they were declared in. It reads nothing
  from storage and caches nothing, so a refresh re-renders and an edit shows up; that bypass is a
  requirement rather than a convenience, since a served card is content-addressed and every edit otherwise lands on a different
  URL with the previous render sitting immutable in the bucket. The sample data is invented rather
  than looked up, so the preview works on a site with no content in it, and a rule's matcher
  contributes the names it narrows on.

  A debug-bar panel answers the second question a card author asks. Four links resolve a page's
  `og:image` and the rendered markup says nothing about which of them won, so the panel names it — the explicit `.ogImage()`
  role, the entry's featured photo, the card and the rule that produced it, or the site-wide default
  — along with the reason there is no card on the page. That is where a renderer whose format
  scrapers cannot read is reported, which is why no boot-time warning exists for it.

  Both surfaces sit behind the `PLUMIX_DEV` gate and a dynamic import, the same shape core uses for
  its own dev-only routes, so neither leaves anything in a production build.

  Makes `debug_bar:panels` a hook a plugin can actually name. Its declaration was outside the closure
  the package barrel anchors, so nothing outside core could subscribe to it however clearly the docs
  said otherwise; core now anchors it and exports the bar's presentational primitives
  (`DebugSection`, `DebugKV`) so a contributed panel reads like the ones core registers.
  `ruleLabel` joins `resolveRule` on the public surface, and the `isJsonObject` and `isJsonArray`
  guards join the `JsonValue` type they narrow.

- [#1993](https://github.com/withplumix/plumix/pull/1993) [`5b30da7`](https://github.com/withplumix/plumix/commit/5b30da79f79563e1578bc940f46fd26836570287) Thanks [@nasyrov](https://github.com/nasyrov)! - Cards now cache at the edge and invalidate through the machinery pages already use. The card route
  takes core's plugin-route read-through, and stores its response under the tag the card's own `key`
  emitted — for an entry card, the `e:<id>` tag `entry:published` already sweeps. One caching story
  for the page and for the card it advertises, rather than two. A card keyed with `cardKey.of` is
  tagged in an `og:` namespace instead, since only its author knows what it read; nothing purges
  those, and the URL is what invalidates them.

  A card URL now carries the card's digest — `/_plumix/og/card/entry/<id>/<digest>.<ext>` — and is served
  `public, max-age=31536000, immutable`. That is the point of the tag purge being belt and braces
  rather than the mechanism: purging reaches Cloudflare and stops there, while the image caches X,
  Facebook and LinkedIn keep hold an `og:image` by URL for weeks, so the only lever on them is
  publishing a URL they do not have. An edit produces one. The digest-less URL still resolves —
  `/_plumix/og/card/entry/<id>.<ext>` redirects to whichever render is current — which is how you open a
  card by hand, and a URL an edit has superseded redirects there too rather than 404ing on a scraper.

  Cards carry no audience-segment axis. The session and locale cookies are scoped to `/_plumix/`, so a
  signed-in visitor's browser does send them to the card route — and `Accept-Language` counts on that
  path too. Every card therefore renders in the site's own locale rather than the visitor's: otherwise
  a scraper sending `Accept-Language` would digest a URL the head never published and be redirected
  away from its image, and a card reading the locale without naming it in its key would freeze
  whichever locale asked first into bytes no purge can reach. A query string is refused rather than
  ignored, since the edge keys on the whole URL. The response carries no `Vary` and no `Set-Cookie`.

  Core gains `tagCacheEntry(ctx, tags)` for this: a `cacheable: true` route is the only party that
  knows what its own response read, so it names its tags in the same `t:<type>` / `e:<id>` vocabulary
  core purges by. A route that names none still stores untagged, exactly as before.

- [#2008](https://github.com/withplumix/plumix/pull/2008) [`3a7c64a`](https://github.com/withplumix/plumix/commit/3a7c64a56238e148af7088f28e447acca9b4ab79) Thanks [@nasyrov](https://github.com/nasyrov)! - An author can see what a post will look like when it is shared, before publishing it. Name the entry
  types that should carry it — `og({ preview: ["post", "page"] })` — and each one's editor gains a
  **Social card** box: the image the entry will actually be shared with, a line naming which of the
  four links of the `og:image` chain produced it, and — where no card was generated — the reason, in
  the same vocabulary the debug bar's og panel reads. "I set a featured image and the preview did not
  change" now reads back as _The card steps aside for the featured image_.

  The preview renders on request and reads nothing back from storage, so a draft has one too — which
  is the point, since a card's URL is addressed by a digest over what the card read, and a draft has
  no stable one while an entry under edit moves out from under it. It overlays the caller's pending
  autosave the way `entry.get`'s preview mode does, because on an entry type supporting autosave a
  _published_ entry's meta edits land on a per-user draft row — so a featured image picked on a live
  post shows up here before it is published. The bytes travel back inline from a plugin procedure
  gated on the entry's own edit capability; with a `remote()` renderer connected the card's content
  also reaches that endpoint, which is the operator's own service.

  An entry no scraper could reach — a private type, or one an access policy gates — gets no card in
  the preview either. Only the _status_ half of that check is skipped, since showing a draft is the
  point; skipping the rest would name a link the page will never use.

  It previews; it does not choose. There is no per-entry override, no template picker and no mode
  select: the chain is the one precedence authority, and adding a fifth control before authors can
  see the outcome is backwards. When per-entry control does arrive it has to become that authority
  rather than sit beside it.

  The list of entry types is not defaulted. A meta box is registered against entry types by name and
  a name nothing registered fails the boot, so a guess here would crash a site for installing a
  plugin; left out, neither the box, the procedure behind it, nor the plugin's admin chunk is
  registered.

  Core exports three helpers this needs, each the seam core itself reads through: `entryRoleImage`
  (the role links of the same chain, so a subscriber that has to say where an image came from is not
  re-deriving them and matching URLs against the result), `loadSiteSettings` (the request-memoized
  `site` bag, so asking for one setting joins the read the head defaults already made), and
  `getAutosave` (the caller's pending draft of an entry).

- [#1991](https://github.com/withplumix/plumix/pull/1991) [`f5d786a`](https://github.com/withplumix/plumix/commit/f5d786ad6fa0341e6c72c12f011ada40204470fc) Thanks [@nasyrov](https://github.com/nasyrov)! - Completes the `og:image` precedence chain: an explicit `.ogImage()` image, then
  the entry's `.featured()` photo cropped to the card's size, then the generated
  card, then the site-wide default. The crop is pure URL math through the
  `imageDelivery:` slot, so the commonest case of all — a post with a photo —
  never reaches the renderer and works on a deploy that cannot rasterize
  anything. With no delivery configured the photo is emitted as it stands, at its
  own size. A card rule may declare `mode: "card"` to be the share image even on
  an entry that has a photo.

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

- [#1983](https://github.com/withplumix/plumix/pull/1983) [`1c67995`](https://github.com/withplumix/plumix/commit/1c67995236f52b0c01a3594d7eab3746191cac5d) Thanks [@nasyrov](https://github.com/nasyrov)! - Emits generated cards into the page head.

  An entry's page now carries its card as `og:image`, with `og:image:width` and `og:image:height` alongside it, so a scraper lays the preview out before it fetches the bytes. The size comes off the card rule the route would resolve, so a theme card declaring its own dimensions is reported at those. The card sits one link below an author's own `.ogImage()` / `.featured()` choice and one above `site.default_og_image`: it beats a generic image and never overrides a deliberate one.

  Cards are PNG by default — around 27 KB for a representative card — with `takumi({ format: "jpeg" })` for a photo-heavy design. The route's extension always names the format behind it.

  What reaches the head is decided by what the renderer declares it produces, not by a flag of its own. `svgOnly()` still serves its route, so you can build and look at cards with no rasterizer, but SVG is never advertised: it unfurls as nothing on X, Facebook and LinkedIn, which is worse than your site's default. A render that throws redirects to that same default and logs, rather than answering an error status the head already promised an image for — and in development it surfaces on the dev error page with its stack.

  Core change behind that last part: a throw from anything mounted under `/_plumix/` — a plugin route above all — now reaches the dev error page in development, where it previously returned an opaque `internal_error` JSON body. Production is unchanged.

- [#1984](https://github.com/withplumix/plumix/pull/1984) [`e581fcf`](https://github.com/withplumix/plumix/commit/e581fcf310170f9a12f6dd264879c851ef08b0d1) Thanks [@nasyrov](https://github.com/nasyrov)! - Refuses a social card for an entry the access layer keeps from anonymous visitors.

  A card carries the entry's title, sits at a sequential id anyone can walk, and is served from a shared cache. It was gated on publication status and the entry type's `isPublic` alone, so an entry behind an `access` policy — one whose page redirects a signed-out visitor to sign-in, or answers a 402/403 — still had a card at `/_plumix/og/card/entry/<id>.<ext>`. The route now asks the access layer too, and answers `404` when the page is gated.

  The head asks the same question, so it never advertises a URL the route refuses — including on a page rendering for a signed-in visitor who _can_ read it, since the scraper that follows the URL cannot. A _soft_ gate keeps its card on purpose: that page serves a public teaser at 200, so the teaser is meant to unfurl.

  Core gains `entryAllowsAnonymousAccess(ctx, entry)`, which resolves an entry's effective policy — the type's `access.default`, or the per-entry choice that overrides it — against an anonymous principal and reports whether the page renders. Anything publishing a public artefact on an entry's behalf can now ask the same question its page does, rather than approximating it.

  A `?preview=` render also reports the entry's per-entry access choice correctly now. The autosave overlay stripped the reserved key, so a template read the type default rather than the choice actually gating the entry — and unlike the template pick, an unsaved access pick must not drive the preview, because the gate resolves its policy from the persisted row.

- [#1980](https://github.com/withplumix/plumix/pull/1980) [`64cf9f1`](https://github.com/withplumix/plumix/commit/64cf9f1a1870d4d3f46e208a7ce970260de9e522) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `@plumix/plugin-og`, an opt-in plugin that renders social cards and serves them from your own site.

  Cards are served but not yet advertised: the plugin owns the route, and writing the card's URL into a page's `og:image` arrives separately. Output is SVG, which is viewable in a browser and deliberately not something a scraper would be handed.

  Install it and configure nothing: every published entry gets a card at `/_plumix/og/card/entry/<id>.<ext>`, where the extension is whatever the connected renderer produces — `.svg` by default. The card is composited from a bundled default template: the entry's title over the site's name. The card is rendered on the first request, written to your storage bucket and read back after that, with a matching `If-None-Match` answering `304`.

  The renderer is a slot. It defaults to the bundled engine, reached through a dynamic import so an install that never renders a card never instantiates the wasm — the bytes ship either way, since the default is resolved inside the package. `takumi()` and `svgOnly()` on the `@plumix/plugin-og/takumi` subpath and `remote({ url })` are the shipped implementations. Fonts are read from the platform asset layer at render time via `fonts: ["/fonts/…"]`, so they cost nothing in the Worker bundle — TTF, OTF and WOFF, not WOFF2.

- [#1982](https://github.com/withplumix/plumix/pull/1982) [`d3c61bf`](https://github.com/withplumix/plumix/commit/d3c61bfa26d2a9cd1b02a4d61a912148e414189b) Thanks [@nasyrov](https://github.com/nasyrov)! - Themes declare their own social cards. An `ogCards` array sits beside `templates` and takes the
  same tier and matcher vocabulary — `card.forEntryType("post")`, `card.entry()`, `card.fallback()`
  — resolved through core's shared rule resolver, with a registered type name narrowing the entry
  data in both callbacks and a typo failing to compile. Every rule states what its card read through
  a required `key`, and `cardKey.entry` / `cardKey.of` emit the URL hash and the purge tag from one
  call. The card's own source and the active font set fold into the key, so a redesign or a swapped
  face invalidates without a version bump. A declared card outranks the plugin's bundled default.

  Core exports `loadTemplateDeps`, so a rule kind that is not a template can load the deps it
  declares.

### Patch Changes

- [#2032](https://github.com/withplumix/plumix/pull/2032) [`9e7eb09`](https://github.com/withplumix/plumix/commit/9e7eb09d91c1462e37949271ecc20c6e5dfadfdf) Thanks [@nasyrov](https://github.com/nasyrov)! - Documents the plugin on the documentation site — declaring cards, the `og:image` chain, the three
  preview surfaces — and writes down the four failures that produce no error message: WOFF2 fonts the
  engine cannot read, the free plan's 10 ms CPU limit (which applies to scheduled handlers exactly as
  to fetch handlers, so the featured-image crop is the path a free-plan site uses), `svgOnly()` not
  shrinking the bundle, and images never being fetched. Corrects the README's Worker size ceiling,
  which quoted the free plan's 3 MB beside a paragraph about needing a paid one, and adds a
  live-registry test pinning what the package's `plumix.scaffold` block composes.
