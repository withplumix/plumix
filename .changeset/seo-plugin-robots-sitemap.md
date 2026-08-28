---
"@plumix/core": minor
"@plumix/plugin-seo": minor
---

**Breaking.** Core no longer serves `/robots.txt` or the sitemap. Both come from
`@plumix/plugin-seo` now, through the public-route seam, and core's SEO folder is down to the
canonical URL and its tag. Install the plugin and add it to the config to keep them:

```ts
import { seo } from "@plumix/plugin-seo";

export default plumix({ plugins: [seo()] });
```

The sitemap keeps its shape — an index plus one paged sub-sitemap per public entry type, taxonomy
and registered archive, published entries only, with `seo:sitemap:urls` intact so a plugin can still
inject rows. `seo:robots-txt` moves across unchanged. Both filters are this plugin's augmentation
now, reached through the single `plumix` specifier, so core keeps no search-engine vocabulary; so is
`sitemap` on `registerArchiveType`, which gains a `tags` field naming the cache tags its pages store
under.

**Routes are enumerated, not matched.** A registered public route has no fall-through, so the plugin
claims `/sitemap.xml` and one `/sitemap-<scope>-:page([1-9]\d*).xml` per registered scope rather
than one pattern over the whole `sitemap-*.xml` space, which would answer for scopes that do not
exist and shadow anything else wanting a path in it. Two consequences a reader should expect: an
unregistered scope (`/sitemap-nope-1.xml`) is a 404 where core answered with an empty `<urlset>`,
and page `0` (`/sitemap-post-0.xml`) is a 404 where core computed a negative SQL offset from it.

**Caching is the shipped edge cache now.** Core's bespoke scheme — a version token in the `settings`
table mirrored into a Cache-API pointer — is deleted rather than moved, along with the subscriber
that bumped it on every entry and term mutation. Sitemap responses declare
`public, max-age=0, s-maxage=3600` and store under per-scope tags instead, so publishing an entry
retires that scope and leaves the others alone where a version bump retired the whole set. Saving
the settings group purges all of them, since the indexing toggle decides whether any of them have
URLs at all. With no edge cache configured the sitemap generates per request, which is exactly the
old no-cache fallback.

Precision has one cost worth naming. A scope with no tags to contribute — a taxonomy registered
with no `entryTypes`, or an archive whose `sitemap` omits `tags` — rides the one-hour window rather
than a purge, where the version bump retired it along with everything else. Core's page cache
already stores such a term archive untagged, so the sitemap now matches the page it points at.

The indexing toggle that moved into this plugin's settings group reaches `robots.txt` and the
sitemap, which read `seo.indexable` and fall back to the legacy `site.public` row — so a site that
had disabled indexing keeps both behaviours with no migration step. `@plumix/plugin-feeds` still
gates on `site.public` directly; syndication is not an indexing decision, and nothing in this
release changes that.

The canonical normalizer no longer names `/robots.txt` as a literal exemption. It is exempt as a
registered public route, and by the dotted-last-segment rule whether or not a plugin claimed it —
core spells no SEO path of its own.

Core gains one export the sitemap needs: `buildTermArchiveUrl`, the async term-archive permalink
builder that walks a nested term's ancestor chain. A sitemap that composed term URLs itself would
drift from the archives it points at the first time a rewrite option moved one.
