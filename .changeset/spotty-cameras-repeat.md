---
"@plumix/plugin-og": minor
---

Adds `@plumix/plugin-og`, an opt-in plugin that renders social cards and serves them from your own site.

Cards are served but not yet advertised: the plugin owns the route, and writing the card's URL into a page's `og:image` arrives separately. Output is SVG, which is viewable in a browser and deliberately not something a scraper would be handed.

Install it and configure nothing: every published entry gets a card at `/_plumix/og/card/entry/<id>.<ext>`, where the extension is whatever the connected renderer produces — `.svg` by default. The card is composited from a bundled default template: the entry's title over the site's name. The card is rendered on the first request, written to your storage bucket and read back after that, with a matching `If-None-Match` answering `304`.

The renderer is a slot. It defaults to the bundled engine, reached through a dynamic import so an install that never renders a card never instantiates the wasm — the bytes ship either way, since the default is resolved inside the package. `takumi()` and `svgOnly()` on the `@plumix/plugin-og/takumi` subpath and `remote({ url })` are the shipped implementations. Fonts are read from the platform asset layer at render time via `fonts: ["/fonts/…"]`, so they cost nothing in the Worker bundle — TTF, OTF and WOFF, not WOFF2.
