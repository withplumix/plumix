# An app page is a view, not an archive

A plugin that needs a public page rendered through the theme, with its
template, head pipeline and access policy, had one seam for it:
`registerArchiveType` without `entries`, a resolver returning the whole
payload. Sites used it for `/login`, `/account`, `/saved` and `/compare/:id`
(#2834). Mechanically that worked. An unlisted archive has no paging, is never
stored by the CDN unless it opts in, and takes an `access` policy. But none of
those pages is an archive. ADR 0008 defines an archive as a listing described
by one entry query, the same for every visitor, which is what lets the CDN
store it. A sign-in form lists nothing, and an account page is different for
every reader. Themes targeted them with `forArchiveType`, and the code called
them archives.

> **A per-visitor app page is a view. A plugin registers it with
> `registerView(name, { routes, access?, cacheable?, resolve })`, it compiles
> to the route intent `view`, its template data is `kind: "view"`, and a theme
> targets it with `forView(name)`. A view is never stored by the CDN unless it
> sets `cacheable: true`, claims no automatic canonical link, and
> `@plumix/plugin-seo` marks it `noindex` unless the site names it in
> `indexViews`.**

This amends ADR 0025's list of page kinds, which gains `view`.

## What this means

- **A ninth page kind.** `view` joins the route intent, the resolved node, the
  template data and the target matcher. It is named by its subject the way ADR
  0025 asks: the page is about the view the plugin registered.
- **Core builds the envelope.** `resolve(ctx, params)` returns
  `{ data, title, tags? }` or `null`. The template receives
  `{ kind: "view", name, params, data }`, so a plugin never restates its own
  name or the params its route captured. `ViewRegistry` types `data` for a
  declared name; any other name still registers, with `data` left `unknown`.
- **A view's `resolve` is a page step** (ADR 0032). It may throw
  `pageNotFound()` or `redirectTo()`, which is how "signed in, so leave
  `/login`" is written.
- **No generic tier.** A view without a `forView` rule renders through
  `fallback`, as an archive type does.
- **Never stored by default.** The CDN skips a view unless it sets
  `cacheable: true`. A cacheable view's `tags` drive its purge. A view with
  `access` renders live whatever it sets, as a policied archive does.
- **No automatic canonical.** A view's document manifest defaults to
  `canonical: false` (#2830). A template whose page has one address declares
  the link in `document()`.
- **Robots vocabulary stays in plugin-seo.** Core says only that the page is a
  view, and which one, through `PageFacts.view`. plugin-seo's indexability
  chain holds every view out with the reason `view`, and the site opts views
  back in with `seo({ indexViews })`, a site policy like ADR 0028's
  `sitemaps`. A name no view registered fails the boot.
- **Not a listing.** A view has no entry query, so it is not an
  `EntryArchive`. It never reaches a feed, a sitemap, llms.txt or an og card.
- **Unlisted archive types stay.** Search is still an archive whose results
  are a match. Existing unlisted registrations keep working, with no
  deprecation shim.

## Considered options

- **Rename unlisted archive types to views** (rejected). Search is an unlisted
  archive and is the same for every visitor with the same query, so it is
  rightly an archive. A rename would have split it from the archive vocabulary,
  and broken every existing registration for a naming fix.
- **Infer caching from reads of the principal** (rejected). No other seam
  decides cacheability from what a resolver happened to read. `access` already
  forces a live render, and #2915's personal-render rule covers a render that
  reads the reader.
- **Keep using unlisted archives** (rejected). That leaves per-visitor pages
  named as listings that are the same for every visitor, which is the opposite
  of what they are, and puts archive cache and indexing defaults on pages that
  want neither.

## Consequences

- `ctx.registerView`, `forView`, `isView`, `ViewData`, `ViewDataOf`,
  `ViewRegistry`, `ViewOptions`, `ViewResolution` and `RegisteredView` are
  published.
- `PageFacts` gains `view`, the registered name on a view page and `null`
  everywhere else.
- A switch over every page kind gains a `view` arm.
