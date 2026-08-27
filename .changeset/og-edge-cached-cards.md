---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

Cards now cache at the edge and invalidate through the machinery pages already use. The card route
takes core's plugin-route read-through, and stores its response under the tag the card's own `key`
emitted — for an entry card, the `e:<id>` tag `entry:published` already sweeps. One caching story
for the page and for the card it advertises, rather than two. A card keyed with `cardKey.of` is
tagged in an `og:` namespace instead, since only its author knows what it read; nothing purges
those, and the URL is what invalidates them.

A card URL now carries the card's digest — `/_plumix/og/card/entry/<id>/<digest>.<ext>` — and is served
`public, max-age=31536000, immutable`. That is the point of the tag purge being belt and braces
rather than the mechanism: purging reaches Cloudflare and stops there, while the image caches X,
Facebook and LinkedIn keep hold an `og:image` by URL for weeks, so the only lever on them is
publishing a URL they do not have. An edit produces one. The digest-less URL still resolves —
`/_plumix/og/card/entry/<id>.<ext>` redirects to whichever render is current — which is how you open a
card by hand, and a URL an edit has superseded redirects there too rather than 404ing on a scraper.

Cards carry no audience-segment axis. The session and locale cookies are scoped to `/_plumix/`, so a
signed-in visitor's browser does send them to the card route — and `Accept-Language` counts on that
path too. Every card therefore renders in the site's own locale rather than the visitor's: otherwise
a scraper sending `Accept-Language` would digest a URL the head never published and be redirected
away from its image, and a card reading the locale without naming it in its key would freeze
whichever locale asked first into bytes no purge can reach. A query string is refused rather than
ignored, since the edge keys on the whole URL. The response carries no `Vary` and no `Set-Cookie`.

Core gains `tagCacheEntry(ctx, tags)` for this: a `cacheable: true` route is the only party that
knows what its own response read, so it names its tags in the same `t:<type>` / `e:<id>` vocabulary
core purges by. A route that names none still stores untagged, exactly as before.
