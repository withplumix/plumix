# A public surface asks per entry, not per type

An entry type's `access` policy gated only the entry's own single and archive
routes. Every other surface that shows entries, the front page, the taxonomy,
author and date archives, search, the REST API, and the plugins' feeds and
sitemap, read through two rules that never asked the policy. A gated entry's
title and excerpt surfaced anonymously there, and its body through a feed. The
plugins patched it by dropping any type with `access` whole (#2555), which hid
every public entry of a type the moment one of them was gated (#2875).

> **Core's read rules apply each entry's access policy for the request's own
> principal. Every surface built on them is correct with no option to pass. A
> principal who may edit a row reads it whatever its policy says.
> `anonymousContext(ctx)` is the one way to ask on someone else's behalf.**

## The rule

- `publicEntryRows(ctx)` is the public listing rule: published rows of public
  types. For a type with `access`, a row is in only when its policy admits the
  principal to the listing. `readableEntryRows(ctx, type)` and
  `canReadEntry(ctx, row)`, the capability rules behind REST, RPC and the
  lookups, add the same condition to their published half.
- A row's policy is its stored key under `meta.__plumix_access`, or the type's
  `default` when the key is missing or names no policy, as on the entry's own
  route. The rules match it in SQL with `IN` over the keys the principal is
  admitted to, so a list of any length is one query.
- Each of a type's policies resolves once per request and principal, through
  the request memo. Resolving reads the principal, so a listing that touches a
  policied type is a personal render ([ADR 0030](0030-a-render-that-reads-the-principal-is-never-shared.md))
  for a signed-in member, and only the anonymous listing is ever shared.

## Listing and content

A policy's gate admits a principal to two things:

- **the listing** (title, excerpt, URL and images) when it is `allow` or a soft
  `challenge`;
- **the content** (the body) only when it is `allow`.

So a soft-challenged entry is listed as a teaser. `resolveEntryList`, which
every listing resolves its rows through (core's archives and search, a plugin's
own list, the REST API), hands that entry over with `contentGated: true` and no
`content` or `contentBlocks`. The entry's own page still receives the body and
serves its teaser as before. A `redirect` or a hard
`challenge` keeps the entry out of the listing altogether.

## Editors

The earned-unpublished half of `readableEntryRows` and `canReadEntry` already
belonged to whoever may edit the row. The published half follows: `edit_any`,
or `edit_own` over a row the principal wrote, reads the row whatever its policy
says, and `resolveEntryList` hands them its body even where the policy lists it
as a teaser. An editor working in the admin or the API sees the content they
manage.
`publicEntryRows` has no such bypass: it is what the principal is shown as a
reader.

## Asking for someone else

A public artefact built from a signed-in request, such as a shared card, an
IndexNow ping after an editor saves, or a cron's output, must say what
anonymous visitors may see, not what its requester may. `anonymousContext(ctx)`
derives a context with no user, no token scopes and an anonymous `auth.can`,
over the same `db` and `plugins`, with its memo entries kept apart from the
request's. Passing it to the rules answers for anonymous visitors. plugin-og
and plugin-comments use it in place of `entryAllowsAnonymousAccess`, which is
removed.

## Considered options

- **Exclude a policied type whole** (rejected; it was #2555's rule). It keeps
  gated entries out, and every public entry of the type with them. A site that
  gates one page loses its pages from the sitemap, the feed and search.
- **A `readableBy` option on queries** (rejected). A caller choosing whose
  access a query applies puts a security decision on every call site, and the
  default is whichever a caller forgets. The principal is already on the
  context, and `anonymousContext` covers the one case that needs another.

## Consequences

- `publicEntryRows` takes the context, not the registry, and is async; so are
  `readableEntryRows`, `canReadEntry` and `adminEntryScope`.
- An anonymous REST read keeps the lowest role's capabilities but no longer
  carries a stand-in user, so a policy sees it as the anonymous visitor it is.
- A member-segment page that lists any public type on a site with a policied
  type is personal for signed-in members, since its listing reads the
  principal. That is the cost of a listing that differs per principal.
