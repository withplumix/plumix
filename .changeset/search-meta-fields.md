---
"@plumix/plugin-search": minor
"@plumix/core": minor
"plumix": minor
---

Adds `.searchable()` to the meta-field builders, so structured data an entry stores in its meta bag
can be found from the site's search page.

Default-deny, the way `.showInApi()` is. Meta holds plugin bookkeeping and internal keys at least as
often as it holds prose, and indexing all of it is the mistake ElasticPress spent a decade on before
reversing it — the same failure this epic already fixed for entry content. Nothing about an existing
site's index changes until a field asks.

The chain is offered on the text-shaped builders — `text`, `textarea`, `email`, `url` and `richtext`,
whose stored document is flattened to its prose. A capability-gated field is never indexed whatever
it declared, and neither is a `password` field: a snippet is body text around a word the visitor
chose, so a value not everyone may read cannot be in the document at all. That is the same rule that
keeps an access-gated entry type out of the projection entirely.

Marking an existing field searchable needs nothing else. The extractor version now hashes the field
roster beside the block roster, so every affected document is stale from that moment and the
scheduled run re-projects them — no version to bump, no entry to re-save.

**Core.** `entries.meta` joins the change feed's watched columns, so a meta write reaches a consumer's
projection the way a title edit does — including one made by a seed, a migration or a direct write.
That arrives as a raw SQL migration: run `plumix migrate generate` and apply it after upgrading.
