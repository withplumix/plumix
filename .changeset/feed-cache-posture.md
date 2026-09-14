---
"@plumix/plugin-feeds": minor
"plumix": patch
---

Caches feeds at the edge. RSS and Atom responses now send `cache-control: public, max-age=0, s-maxage=3600` and are stored under the tags of the entry types they list, so publishing, editing or trashing an entry, or saving the site settings, purges the feeds it appears in. A plugin archive's feed is cached only when the archive registered with `cacheable: true`; otherwise it is served live with no `cache-control`. A private site's feeds still answer 404 and are never stored. `createDispatcherHarness` given a `cdn` now also subscribes core's entry and term purges, so a test can observe what a mutation retires.
