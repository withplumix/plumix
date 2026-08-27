---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

The bundled default card now covers every page kind core routes, not just entries. Install the
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
