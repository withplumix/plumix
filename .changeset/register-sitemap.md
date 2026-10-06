---
"@plumix/plugin-seo": minor
---

Adds `ctx.registerSitemap(name, source)`, so a plugin can list a URL space of its own in `/sitemap.xml` with no archive behind it, and adds `<lastmod>` to the index's entries: an entry type's page carries the newest `updatedAt` on it, and a contributed page carries what its source's `lastmod` answers. Breaking: `ArchiveTypeOptions.sitemap` and the `ArchiveTypeSitemap` type are removed; an archive that wants a sitemap calls `registerSitemap` under its name, with the same `count`, `urls` and `tags`. A contributed sitemap is no longer held out for an `access` policy on an archive of the same name, since seo no longer reads the archive: a source whose URLs are not public does not list them.
