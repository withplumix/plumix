---
"@plumix/plugin-seo": patch
---

Fills `%%searchphrase%%` on a search page a plugin renders.

Companion to the archive facts: `@plumix/plugin-search` replaces core's `/search` with an archive of
its own, and the title variable read the query off core's payload, so a site with a search title
pattern shipped `Results for  · Demo` once the plugin was installed. It reads `PageFacts.query` now,
which core's search page and a plugin archive that states a query both carry.

`%%count%%` stays empty on a plugin archive, and the docs now say so. Core counts what it paginates;
a plugin archive's listing is its own, and the search plugin probes for a next page rather than
totalling its matches — so filling the variable would mean a `COUNT` over the index on every search
render, for a variable a pattern can simply leave out.
