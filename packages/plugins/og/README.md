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

- **A card per published entry**, at `/_plumix/og/entry/<id>.<ext>` — PNG by default, and the extension always names what the renderer produces. It is composited from a bundled default template: the entry's title over your site's name.
- **Share a link and the card is what appears.** The entry's page carries the card as its `og:image`, with `og:image:width` and `og:image:height` so a scraper can lay the preview out before it fetches a byte. An author's own `.ogImage()` or `.featured()` image still wins; the card only outranks the site-wide default.
- **Render once, serve cheaply** — a card is rendered on the first request, written to your storage bucket, and read back after that. A matching `If-None-Match` answers `304`.
- **A renderer you can swap.** `renderer:` takes the bundled engine (`takumi()`, or `takumi({ format: "jpeg" })` for a photo-heavy design), the same engine's SVG output (`svgOnly()`), or `remote({ url })` to render off-box.
- **Cards your theme designs**, declared beside its templates — see below.

## When a card cannot be advertised

A card reaches a page's head only when the connected renderer produces a format scrapers render — PNG or JPEG, the intersection of what X, Facebook and LinkedIn all document. Anything else still serves its route, so you can build and look at your cards with no rasterizer in play, but the head falls through to your site-wide default: an SVG `og:image` unfurls as nothing at all, and WebP unfurls inconsistently, both worse than a generic image that works everywhere.

An entry the access layer keeps from an anonymous visitor gets no card either, and its route answers `404`. A card carries the entry's title, sits at a sequential id anyone can walk, and is served from a shared cache, so it is refused on the same terms its page is — asked of a scraper carrying no session, whoever happens to be reading. A _soft_ gate is the exception on purpose: its page serves a public teaser at 200, so the teaser unfurls with a card like any other page.

A render that throws is the same story from the other end: the page already shipped the card's URL and cannot take it back, so the route redirects to your site default and logs what broke rather than answering an error a scraper would render as a hole. In development it stops at the dev error page instead, with the stack.

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
