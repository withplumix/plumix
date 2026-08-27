---
"@plumix/plugin-og": minor
---

Cards can paint images, and the renderer never fetches one. A card's tree takes `image` nodes, and
the plugin resolves every `src` itself before the render: media the site's storage addresses
directly, media the `/_plumix/media/serve/<id>` route proxies from a private bucket, and `data:`
URIs, which pass through carrying their own bytes. Anything else is dropped, not fetched — the
bytes reach the renderer already resolved, so there is no code path from a card to an outbound
request, and no render option is ever read from the card's URL.

Resolving is not the same as accepting: an object over 8 MB or one whose stored content type is not
an image is dropped too, since the engine throws on bytes it cannot decode and a card should lose
one image rather than its whole render.

That removes the class of problem behind three advisories in the equivalent Nuxt module rather than
mitigating it, and it keeps a render deterministic: no network on the render path means no timeouts
and no half-drawn cards.
