---
"@plumix/plugin-seo": minor
---

Adds per-entry-type title patterns and completes the robots decision chain.

**Title patterns.** A pattern is a line with `%%variables%%` in it, resolved per page: `%%title%%`,
`%%sitename%%`, `%%sep%%`, `%%term%%`, `%%author%%`, `%%date%%`, `%%searchphrase%%` and
`%%count%%`. Set one per entry type and every entry of that type is titled consistently; set the
site-wide default and it covers every page no per-type pattern does — term, author, date and search
archives included. An entry's own search title outranks both.

A variable the page has nothing for resolves to empty, and a separator left holding nothing
together is trimmed away, so `%%term%% %%sep%% %%sitename%%` ships as `Demo` rather than `· Demo`
on a page with no term. A name that is not a variable is dropped rather than emitted — shipping
`%%titel%%` into a search result is worse than shipping a shorter title.

When a pattern or a search title composes the title, the plugin now ships it verbatim rather than
letting a theme's `titleTemplate` append the site name a second time. A page with no pattern and no
override still sets no title at all and keeps whatever the theme composed.

**The full chain.** Indexability is decided by an ordered set of named assertions, short-circuiting
on the first that fires: `site_private`, `entry_override`, `type_default`, `taxonomy_default`,
`search_results`, `paginated`, `not_found`, then `default`. Four of those are new. A site owner
gains per-entry-type and per-taxonomy indexing defaults, so a whole class of content leaves the
index and the sitemap at once, and paginated archives, search results and pages that were not found
are held out by default with a toggle each.

The sitemap agrees across all of it: a scope whose type or taxonomy is held out is absent from the
index and serves an empty `<urlset>`. The three arms below `taxonomy_default` describe pages the
sitemap never lists.

**Settings are enumerated from the registry.** The group now carries a title separator, a default
pattern, the three thin-page toggles, and one pattern plus one indexing toggle per public entry
type and taxonomy — registered at `theme:ready`, so a type any plugin registers during `setup` gets
its fields. Two things are out of scope by construction: a type registered from a `theme:ready`
handler that runs after this plugin's is too late to be enumerated, and a name that is not
`[a-zA-Z0-9_-]+` cannot be a settings field key, so it gets no per-type fields rather than failing
the boot — core validates neither entry-type nor taxonomy names.

Two behaviours worth naming, both on error pages, which reach this plugin's head for the first time.
They no longer declare a canonical URL or an `og:url` — a URL that resolved to nothing is the
canonical address of nothing, and core leaves an error page's canonical unwritten for the same
reason. They do now carry the rest of the set, so a shared broken link unfurls with the site's name,
tagline and default social image rather than nothing; the `<title>` core gives them (`Not Found`)
is not localized, which is unchanged but now also reaches `og:title`.
