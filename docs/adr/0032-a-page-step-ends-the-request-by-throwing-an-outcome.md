# A page step ends the request by throwing an outcome

Server code that builds a public page sometimes finds that there is no page to
build. A block loader looks up a share id nobody issued, or a token that was
already spent. An archive's `resolve` serves `/login` to a visitor who is
already signed in. Before this decision, a loader could only render a fallback
inside a 200, and `resolve` could only return a payload or `null` (#2838,
#2832). The head had a related gap: it was built before any loader ran, so a
page could not title itself from what a loader found (#2837).

> **A page step ends the request by throwing `pageNotFound()` or
> `redirectTo(location, status?)` from `plumix/support`. There are four page
> steps: an archive type's `resolve`, a template dep, a block loader on the
> page's own content, and the template's `document()`. The page's loaders run
> before `document()`, and the head reads what a loader found through
> `ctx.memo`.**

## What this means

- **Thrown, not returned.** A loader's return type flows by inference into its
  block's `render` props (`ResolvedLoaders`). A returned union would put the
  outcome into every block's props, and every block would have to narrow it
  away. A throw keeps the success type clean. `resolve` keeps `null` as its 404
  shorthand.
- **Recognised by a registered symbol.** The constructors brand the value with
  `Symbol.for("plumix.pageOutcome")`. A copy of the module bundled separately
  makes values that still match, which `instanceof` would not.
- **One catch.** `resolvePublicRoute` turns the outcome into the response. A
  `pageNotFound()` takes the path a resolver's `null` takes: the theme's
  `notFound` template, with the same status and caching. A `redirectTo()`
  answers with its status and a `Location` header.
- **302 by default.** A redirect from a page step usually depends on the
  session or on state, such as a signed-in visitor or a spent token. Neither
  the CDN read-through nor a browser may keep it, so it is never stored and
  leaves with `cache-control: private, no-store`. Any `RedirectStatus` is
  accepted. The `location` is sent as given; core does not prefix the base
  path, because only the caller knows what it meant.
- **Isolation still holds for errors.** An outcome passes through the
  per-block loader isolation and the per-dep isolation in production and in
  dev. Any other rejection is isolated as before, and still becomes the dev
  error page in dev.
- **Loaders before `document()`.** The page-content loader fan-out runs after
  the template deps and before `document()` and `render:document`. So an
  outcome stops the render before any of the head is built. `document()` may
  be async.
- **The head reads loader results through `ctx.memo`.** The loader and
  `document()` call one function that wraps its lookup in `ctx.memo`. It runs
  once per request, and both callers keep its type.

## Where an outcome is not honoured

- **React components and `render:document` filters.** A component renders
  after the response is decided. A filter is a plugin transforming the head,
  not a step that owns the page. A throw from either is an ordinary error.
- **Loaders on an archive listing.** With `prefetchArchiveLoaders`, each
  entry's loaders run on the archive's page. One entry must not 404 or
  redirect the whole archive, so there the outcome is that block's loader
  error.
- **The editor.** Under `?plumix.edit` and in the refresh-block-loader RPC, the
  outcome is the block's loader error, so the page the author is editing still
  opens. A `?preview=` render honours it, because a preview shows what a
  visitor will get.

## Considered options

- **Return an outcome union.** Rejected for the inference leak described
  above.
- **Pass loader results to `document()`.** The results are keyed per block
  instance, by node id, and are untyped where the template reads them. A
  template would have to know which node ids its content holds. `ctx.memo`
  gives the same data, typed, with no new channel.
- **A loader `head()` contribution API.** It is a second way to write the head
  beside `document()` and `render:document`. That means a merge order to
  define and to learn, for what one memoized function already gives.
- **Reuse an access policy's `redirect`.** That outcome carries no location and
  always means "go to sign-in". Redirect rules see only the URL, never the
  request's session or state.
