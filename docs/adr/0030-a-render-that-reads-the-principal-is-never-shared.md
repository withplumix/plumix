# A render that reads the principal is never shared

A policied page is cached per audience segment: `authenticatedPolicy`,
`rolePolicy` and an entitlement grant all store one copy per segment and serve
it to every member (#1740). The design said such a render must not depend on
which member is viewing, and nothing enforced it. A block loader reading
`ctx.user`, a component calling `useUser()`, or the front-end admin bar, which
shows the viewer's email, baked one member's data into the copy every other
member received (#2835).

> **A public render that reads the principal is personal. It is never stored
> in a shared segment's entry, and it leaves as `private, no-store`. Core
> tracks the reads; nothing asks an author to declare them.**

## The render phase

The phase starts when the dispatcher hands the request to the public route
render, after the segment is chosen and the gate has passed, and ends with the
response. Loading the user, the policy resolver, the gate and the dispatcher's
own checks run before it, and their reads do not count: a resolver reads the
principal to choose the segment, which is what a segment is for.

Inside the phase, these reads mark the render personal:

- reading `ctx.user` or `ctx.tokenScopes`, or calling `ctx.auth.can()`, on the
  context the phase runs with. That covers the template's `render` and
  `document`, a template dep loader, a block loader, an archive type's or a
  view's `resolve`, and a `render:document` subscriber;
- calling `useUser()`, or reading `user` from the renderer context.

The dispatcher derives the phase's context with accessors over those members
(`trackPrincipalReads`), and the read-through asks for the verdict after the
render. A request with no principal keeps its context: there is nothing to
track, and the anonymous path pays nothing.

Two decisions are made before the render rather than by a read, and each makes
the render personal from the start:

- **Locale.** When the locale resolved with the principal differs from the one
  the same request resolves to without them, the page is theirs. Otherwise
  reading `ctx.locale` is not a principal read.
- **Admin bar.** Core decides whether the bar shows with the staff check #2814
  introduced (`canAccessAdmin`), and a render with the bar is personal. The
  bar's own reads of the viewer never mark anything; only the decision does,
  so a subscriber, who gets no bar, shares the segment's copy.

## Effect

A personal render in a shared segment is not written to the CDN store, is not
decorated as shared, and goes out `private, no-store` with `vary: cookie`, as
every non-anonymous render already did. A stored copy of the same segment is
still served on a hit, and a personal render does not evict it. The `cdn`
telemetry record for the request carries `personal: true`. There is no dev
warning.

On the `anonymous` segment the question cannot arise, because every privileged
request renders `private` there (#2914). On the `private` segment nothing is
ever stored, so the verdict changes nothing.

## Considered options

- **Withhold the principal from shared renders** (rejected). Handing a shared
  render `user: null` keeps the cache sound, but it silently changes what a
  theme shows: a greeting, a member-only block, an edit link all vanish for a
  signed-in member, with nothing to say why.
- **An opt-in "personal" marker** (rejected). A `markPersonal()` a block or
  template calls relies on every author remembering, and forgetting is how
  #2835 happened. Tracking makes the marker unnecessary.
- **Carve the admin bar out of shared renders** (rejected). Staff could then
  share a segment's copy, but a staff render is small traffic and was already
  uncached before policies existed. It is simply private.

## Consequences

- A theme or plugin that reads the principal on a shared-segment page turns
  that page's caching off for signed-in members. That is the correct cost of
  the read. A page that wants the shared copy personalises on the client,
  through `useAuth()`.
- The soft-challenge teaser (`challenge(kind, { soft: true })`) is covered by
  the same rule: a teaser that reads the principal is personal. Its doc
  comment, the glossary and the CDN docs point here as the enforced rule in
  place of the earlier request that a shared render stay principal-invariant.
- A read made through a context derived before the hand-off, such as a
  resolver's memoised result, is not tracked. The memo's own contract already
  forbids a principal-dependent loader without the principal in its key.
- The phase's context tracks through accessors, so spreading it (`{ ...ctx }`)
  reads them and marks the render personal. Core derives its contexts before
  the hand-off and does not spread the phase's.
