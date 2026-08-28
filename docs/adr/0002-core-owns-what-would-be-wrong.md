# Core owns what would be wrong without a plugin; a plugin owns what would be absent

Plumix core has moved SEO twice: it was plugin-only, then core-by-default, and
it is now returning to plugins (#1992). Both moves were argued on the topic —
"is SEO part of a CMS?" — which has no stable answer, so the boundary moved
whenever the argument was made again. Drawn on **consequence** instead, it
resolves and stays resolved:

> **Core owns what would be _wrong_ without a plugin installed. A plugin owns
> what would merely be _absent_.**

A site with no sitemap has not opted into one. A site whose redirect normalizer
permanently sends `/about/` to `/about` while the page never declares
`<link rel="canonical">` is contradicting itself — that is wrong, not absent, so
core keeps the canonical URL, its tag and the normalizer, and hands away head
meta, `robots.txt`, the sitemap and the feeds.

The rule cuts the same way outside SEO. Core keeps the edge cache, because a
response stored under the wrong key is wrong; it does not keep IndexNow, because
a site that notifies nobody is merely quiet.

Applying it needs a seam, which is what `registerPublicRoute` is: without a way
for a plugin to answer at the site root, "core owns robots.txt" is a fact about
the dispatcher rather than a decision anyone made. Registered public routes match
ahead of core's own SEO branches deliberately, so a plugin's route can shadow the
built-in one and the moves land green instead of requiring a simultaneous
add-and-delete.

## Considered options

- **Boundary by topic** (rejected). "SEO is/isn't core" is the question that has
  already been answered both ways. It cannot be re-derived from anything, so it
  is re-litigated whenever someone new asks.
- **Boundary by weight** (rejected). "Core keeps what is small" explains the
  canonical URL staying and the sitemap leaving, but only by accident — it would
  equally justify core keeping a one-line `robots.txt`, which is precisely the
  convenience-at-a-time erosion this rule exists to stop.
- **Everything in core, configurable** (rejected). This is where the surface
  came from: nine modules every deployment pays for, one site-wide on/off
  toggle, and no way to replace a decision rather than disable it.

## Consequences

- A new capability is core's only if its absence produces incorrect output, not
  merely missing output. That question is answerable without knowing the
  feature's domain, which is what makes the boundary hold.
- Core holds no search-engine vocabulary once the carve-out lands: no `robots`,
  no `sitemap`, no feed fields on archive-type registration.
- Plugins need parity with core's own routing reach, hence `registerPublicRoute`
  and the derived canonical exemption — a hardcoded exemption list naming the
  paths that are leaving would go stale the moment they left.
- A default install is unchanged in what it emits, because the scaffolder
  preselects both plugins. The architecture is honest; the out-of-the-box site
  is not worse.
