---
"@plumix/plugin-seo": minor
---

Adds sitemap images, a browser-readable sitemap, AI-crawler rules, `llms.txt` and IndexNow.

**Images in the sitemap.** An entry's pictures ride its `<url>` as image entries, so image search finds
them without crawling the page for `<img>` tags. They are the media fields the entry type tagged
`.featured()` or `.ogImage()` — the declarations the social-image chain already reads — plus the
social image URL an editor typed into the SEO box, which leads because it is the one they chose. A
whole page of entries resolves through one batched pass rather than a query each, and only for types
that declare such a field. Only images are listed and at most ten per URL, since a role-tagged field
can be a `.multiple()` gallery; a URL that resolves relative — the worker-proxied path a private
bucket hands back — is made absolute, because `<image:loc>` has to be. An entry with no picture
serializes exactly as before, and a page with none declares no image namespace at all.

**A stylesheet on the sitemap.** Every sitemap document names `/sitemap.xsl`. A crawler ignores the
instruction and parses the same XML; a browser renders a table of URLs, last-modified stamps and
picture counts. The stylesheet is inline and static, so nothing it renders needs a second request.

**AI-crawler rules.** **Block AI crawlers** adds one `robots.txt` group naming the crawlers that feed
model training and assistant answers — `GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot` and
a couple of dozen more — and disallows them everything. Ordinary search crawlers are untouched:
holding those out is what the indexing toggle does. A site already held out of the index says nothing
extra, since its allow-none rule covers every agent.

**`llms.txt`.** The llmstxt.org convention: the site name, its tagline and a link to the sitemap,
adjustable through a new `seo:llms-txt` filter. The map is offered only to a site that wants to be
read this way — one held out of the index has nothing to offer, and one blocking AI crawlers has
already said the opposite — so both get the heading and a sentence instead. The file is served
either way, since a 404 reads as "not implemented yet".

**IndexNow.** Setting a key turns on notification: publishing or updating an entry submits its URL to
the shared endpoint, which fans out to every participating engine, so a change is picked up in
minutes rather than at the next crawl. The key is served at `/indexnow-key.txt`, which the submission
names as its `keyLocation` — a fixed path rather than `<key>.txt`, because the key is a runtime answer
and routes are claimed at boot.

Notification is safe by default. Every gate the head and the sitemap apply is applied here too, so a
draft, a hidden entry, a non-public type and a private site are never submitted. One publish is one
submission — `entry.update` fires both `entry:updated` and `entry:published`, so the submission is
memoized per entry for the request. It is deferred past the response and swallows every failure into
a log line: an unreachable endpoint, a timeout or a refused key is a missed notification, not a
failed publish. Removals are not notified — a trashed entry drops out of the sitemap and is
recrawled on the engine's own schedule. Nothing is submitted until a key is set.

`renderSitemapIndex` and `renderSubSitemap` now take the stylesheet href as a second argument.
