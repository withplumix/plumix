# A sitemap source is contributed, and the site sets its policy

The sitemap index used to grow only through registrations: a public entry type,
a public taxonomy, or an archive type that declared a `sitemap`. A plugin with a
URL space that was not an archive had no way in, so eduscope served
`/sitemap-extra.xml` from its own route and advertised it from `robots.txt` alone
(#2821). A site had no say over a scope it did not register: a third-party
plugin's entry type or archive could not be held out of the index or given a
`changefreq`, short of a `seo:sitemap:urls` filter that emptied the URLs while
the index still listed the scope (#2820). Scope names were bare, so an entry
type and a taxonomy sharing one silently lost the taxonomy's sub-sitemap.

> **A sitemap source is contributed to `@plumix/plugin-seo`, not declared on the
> registration of what it lists. Seo provides the entries and terms scopes, and a
> plugin contributes its own with `ctx.registerSitemap(name, source)`. The site
> sets the policy for every scope, its own and every contributor's, in
> `seo({ sitemaps })`: `false` to leave it out, or the `changefreq` and `priority`
> its URLs default to. A URL's own values beat the site's defaults, and the
> `seo:sitemap:urls` filter has the last word.**

## What this means

- **Scopes are namespaced.** Entry-type scopes sit under `entries`, taxonomy
  scopes under `terms`, and contributed scopes under their own names, at
  `/sitemap-entries-<type>-<n>.xml`, `/sitemap-terms-<tax>-<n>.xml` and
  `/sitemap-<name>-<n>.xml`. `entries` and `terms` are reserved. A duplicate
  contributed name fails at boot naming both plugins, and a policy key naming no
  scope fails at boot.
- **`false` is about the sitemap only.** The admin "Hide from search engines"
  settings still decide indexability, and they write the robots directive as well
  as dropping the URLs. The site-wide indexing toggle still empties every scope.
- **Registrations carry no sitemap options.** `ArchiveTypeOptions.sitemap` is
  removed rather than kept as a second way in, and `ctx.registerSitemap`
  replaces it (#2821). An archive that wants a sitemap calls it like any other
  plugin.
- **Only seo-built sitemaps are listed.** The index names no outside XML; a
  sitemap seo did not build is not seo's to gate. A site advertises one with a
  `Sitemap:` line through `seo:robots-txt`.

## Considered options

- **Options on each registration** (`registerEntryType("post", { sitemap: {...} })`).
  Rejected: the site cannot change what a third-party plugin declared without
  that plugin's source. WordPress, Yoast and Nuxt all set this policy from
  outside the content.
- **Keep `ArchiveTypeOptions.sitemap` and add a standalone registration beside it**
  (#1697 chose the archive option). Rejected: a sitemap that needs an archive to
  exist ties a URL list to routes it may not have, and two ways in is one too many.
- **Outside sitemaps in the index** (`index: [url]`, as Nuxt and Yoast offer).
  Rejected for now: nothing needs it, and adding it later is an additive
  top-level option.
- **Path-glob policy** (Nuxt `routeRules`). Rejected: the scope is the unit the
  index is built from, and a scope name survives a permalink change that a glob
  does not.
