# @plumix/plugin-og

This Plumix plugin renders **social cards** — the title-on-your-branding image a link unfurls into on X, LinkedIn or Slack — and serves them from your own site.

## Install

```bash
pnpm add @plumix/plugin-og
```

Then add it to your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { og } from "@plumix/plugin-og";

export default plumix({
  // …your runtime, database, and auth
  storage: r2({ binding: "MEDIA" }),
  plugins: [og()],
});
```

## What you get

- **A card per published entry**, at `/_plumix/og/entry/<id>.<ext>` — the extension is whatever the connected renderer produces, `.svg` by default. It is composited from a bundled default template: the entry's title over your site's name.
- **A card you can look at today.** The plugin serves the route; it does not yet write the URL into a page's `og:image`, so cards are not advertised to scrapers until that lands. Output is SVG for the same reason — it is viewable in a browser, and no scraper would accept it.
- **Render once, serve cheaply** — a card is rendered on the first request, written to your storage bucket, and read back after that. A matching `If-None-Match` answers `304`.
- **A renderer you can swap.** `renderer:` takes the bundled engine (`takumi()`), the same engine's SVG output (`svgOnly()`), or `remote({ url })` to render off-box.
- **Cards your theme designs**, declared beside its templates — see below.

## Cards your theme declares

A theme adds an `ogCards` array next to its `templates`, in the vocabulary it already uses: a generic tier, or a targeted matcher narrowed the same way. The first rule that matches wins, and anything a theme declares sits ahead of the bundled default.

```ts
import { defineTheme } from "plumix/theme";

import { card, cardKey } from "@plumix/plugin-og";

export default defineTheme({
  templates: [...],
  ogCards: [
    card.forEntryType("post").define({
      key: ({ data }) => cardKey.entry(data.entry),
      render: ({ data }) => ({
        type: "container",
        className: "card",
        children: [{ type: "text", text: data.entry.title }],
      }),
      styles: [".card { display: flex; padding: 72px }"],
    }),
    card.fallback().define({ key: ..., render: ... }),
  ],
});
```

`forEntryType("post")` autocompletes against your registered types and rejects a typo at compile time, and both callbacks receive that type's entry projection. A card declares template deps (`settings`, `menus`, …) as slug arrays and receives their results alongside `data` and `ctx` — the `(prev) => next` form templates use to extend their theme's declaration does not apply, since nothing inherits from a card.

### Which page kinds are servable today

Only entries have a card URL — `/_plumix/og/entry/<id>.<ext>`. The builders for the other page kinds (`card.frontPage()`, `card.archive()`, `card.taxonomy()`, `card.author()`, `card.date()`, `card.forTermTaxonomy()`, `card.forDate()`, `card.forArchiveType()`) type-check and resolve, but nothing addresses those pages yet, so a rule declared against one is not served. They arrive with the routes that serve them.

### Every rule needs a key

`key` names everything the card read. It is required rather than derived, because a card reading a setting or a dep has an input no derivation can see and no type can describe. The helpers keep it to one line and emit the URL hash and the cache tag together, so the two cannot drift:

- `cardKey.entry(entry)` — one entry, keyed on its `updatedAt` so an edit reaches the card, tagged for that entry's purge.
- `cardKey.of("home", locale)` — anything else, keyed and tagged on what you name.

Read something the helper does not cover? Append it: `cardKey.entry(entry, siteName)`.

Two more inputs fold in automatically. The **card's own source** does, so a redesign invalidates what it replaced without a version bump — note this covers the card's own body, not a component it calls out to, so a card whose design lives in a child needs the child's identity in its `key`. The **font set** does too, since a swapped face changes every card.

Three things it does not cover, each with the same answer — name it in the `key`:

- `updatedAt` holds whole seconds, so two edits inside one second share a key. A card that renders entry content should name that content: `cardKey.entry(entry, entry.title)`.
- Two renderers declaring the same content type share keys, so swapping between them serves what the previous one stored.
- Nothing deletes a card's predecessor. Every key change leaves the old object in your bucket, so a site that redesigns often accumulates a generation per redesign.

## Fonts

Fonts are read from the platform asset layer at render time, so they cost nothing in your Worker bundle:

```ts
og({ fonts: ["/fonts/Inter-SemiBold.ttf"] });
```

The engine reads **TTF, OTF and WOFF — not WOFF2**, which is what most font packages ship by default. A WOFF2 file produces a card with no text on it. With no `fonts:` declared, the engine's own fallback face is used.

## What the renderer costs

The default renderer is resolved inside this package, so the engine is part of your install whichever implementation you select — roughly 2.3 MB against the Workers 3 MB compressed ceiling. Selecting `svgOnly()` does **not** give those bytes back: it is the same engine's SVG output. `remote({ url })` is the only implementation that leaves the engine unexecuted, and even then it stays installed.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
