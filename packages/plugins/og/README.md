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

- **A card per published entry**, at `/_plumix/og/entry/<id>/<digest>.<ext>` — PNG by default, and the extension always names what the renderer produces. It is composited from a bundled default template: the entry's title over your site's name. Drop the digest — `/_plumix/og/entry/<id>.<ext>` — and you land on whichever render is current, which is how you open a card by hand.
- **Share a link and the card is what appears.** The entry's page carries the card as its `og:image`, with `og:image:width` and `og:image:height` so a scraper can lay the preview out before it fetches a byte. An entry that has a picture of its own shares the picture instead, cropped to the card's shape — see [which image a page shares](#which-image-a-page-shares).
- **Render once, serve cheaply** — a card is rendered on the first request, written to your storage bucket, and read back after that. A matching `If-None-Match` answers `304`.
- **Cached where your pages are cached.** With a `cache:` slot configured, a card is stored at the edge under the same `e:<id>` tag its entry's pages carry, so the publish that clears the page clears the card with it. The URL carries the card's digest and is served `immutable`: an edit publishes a _different_ URL, which is the only thing that makes X, Facebook and LinkedIn refetch an image they already hold — a purge reaches Cloudflare and stops there.
- **A renderer you can swap.** `renderer:` takes the bundled engine (`takumi()`, or `takumi({ format: "jpeg" })` for a photo-heavy design), the same engine's SVG output (`svgOnly()`), or `remote({ url })` to render off-box.
- **Cards your theme designs**, declared beside its templates and styled in its own design tokens — see below.

## Which image a page shares

Four links, in order:

1. **An explicit `.ogImage()` field** on the entry. An author who picked a share image gets it, untouched.
2. **A `.featured()` field** on the entry — the entry's own photo — **cropped to the card's size** through your `imageDelivery:` slot. A photo shot at 4:3 unfurls letterboxed or badly cropped in a 1.91:1 slot; this is what fixes it. The crop is pure URL math, so it costs no CPU and needs no rasterizer: **a post with a photo never reaches the renderer**, which is what makes this path work on the Workers free plan. With no delivery configured — or one with nothing attached to transform through — the photo is emitted as it stands rather than dropped, at its own size.
3. **The generated card.**
4. **Your site-wide default** (`site.default_og_image`).

A card may take the second slot for itself:

```ts
card.forEntryType("post").define({
  mode: "card",
  key: ({ data }) => cardKey.entry(data.entry),
  render: ({ data }) => ({ type: "text", text: data.entry.title }),
});
```

`mode: "card"` shares the card even on an entry that has a photo — the choice for a theme whose share image is branded rather than the picture itself. The default, `"auto"`, steps aside for the photo. A card that cannot be advertised at all — an SVG-only renderer — still yields to the photo whatever `mode` says.

An image some other plugin put on the chain through the `seo:og_image` filter is left exactly as it arrived: neither outranked nor cropped.

Cropping is a feature of this plugin, and it takes its target size from the card rule that matched — so a site that wants cropped share images but no generated cards still declares a card rule to say what shape to crop to.

## When a card cannot be advertised

A card reaches a page's head only when the connected renderer produces a format scrapers render — PNG or JPEG, the intersection of what X, Facebook and LinkedIn all document. Anything else still serves its route, so you can build and look at your cards with no rasterizer in play, but the head falls through to the rest of the chain — the entry's own photo, then your site-wide default: an SVG `og:image` unfurls as nothing at all, and WebP unfurls inconsistently, both worse than a picture that works everywhere.

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

### Your theme's tokens

Whatever your theme declared in `tokens` is compiled to a `:root` block of custom properties and handed to the renderer ahead of the card's own stylesheet — the same `--plumix-<category>-<slug>` names your site's CSS reads. So a card is styled the way the rest of the theme is:

```ts
// theme: tokens: { color: { accent: { value: "#b5472d" } } }

card.fallback().define({
  key: ({ data }) => cardKey.entry(data.entry),
  styles: [
    ".card { --gutter: 36px; padding: calc(var(--gutter) * 2) }",
    ".card__rule { background-color: var(--plumix-color-accent) }",
  ],
  render: ...,
});
```

`var()`, `calc()` and custom properties of your own all resolve, and a card that redefines a token wins — its sheet comes second. Retune a token and every card lands on a fresh key, the same way editing the card itself does.

The same tokens reach both callbacks as **resolved values**, for what a card decides in JavaScript rather than in CSS:

```ts
card.fallback().define({
  key: ({ data, tokens }) =>
    cardKey.entry(data.entry, tokens.color?.accent ?? ""),
  render: ({ data, tokens }) => ({
    type: "container",
    // The card's own sheet paints the accent bar; a theme that declared no
    // accent gets the plain design rather than a bar in the wrong colour.
    className:
      tokens.color?.accent === undefined ? "card" : "card card--accented",
    children: [
      { type: "text", className: "card__title", text: data.entry.title },
    ],
  }),
});
```

A token your theme declared without a `value` — one its own CSS defines — has nothing to resolve, so it appears in neither route. Nor does one your theme's CSS would have rejected: both routes are filtered together, so what a card can style with is what it can read.

### Which page kinds are servable today

Only entries have a card URL — `/_plumix/og/entry/<id>/<digest>.<ext>`. The builders for the other page kinds (`card.frontPage()`, `card.archive()`, `card.taxonomy()`, `card.author()`, `card.date()`, `card.forTermTaxonomy()`, `card.forDate()`, `card.forArchiveType()`) type-check and resolve, but nothing addresses those pages yet, so a rule declared against one is not served. They arrive with the routes that serve them.

### Every rule needs a key

`key` names everything the card read. It is required rather than derived, because a card reading a setting or a dep has an input no derivation can see and no type can describe. The helpers keep it to one line and emit the URL hash and the cache tag together, so the two cannot drift:

- `cardKey.entry(entry)` — one entry, keyed on its `updatedAt` so an edit reaches the card, tagged `e:<id>` so the publish that clears the entry's pages clears its card too.
- `cardKey.of("home", locale)` — anything else, keyed and tagged on what you name. The tag lands in an `og:` namespace of its own, because only you know what the card read: nothing purges it, and the URL is what invalidates such a card — change an input and the link changes with it.

Read something the helper does not cover? Append it: `cardKey.entry(entry, siteName)`.

Three more inputs fold in automatically. The **card's own source** does, so a redesign invalidates what it replaced without a version bump — note this covers the card's own body, not a component it calls out to, so a card whose design lives in a child needs the child's identity in its `key`. The **font set** does too, since a swapped face changes every card, and so do your **theme's tokens**, since a retuned palette repaints every card written against it.

Four things it does not cover, each with the same answer — name it in the `key`:

- `updatedAt` holds whole seconds, so two edits inside one second share a key. A card that renders entry content should name that content: `cardKey.entry(entry, entry.title)`.
- Two renderers declaring the same content type share keys, so swapping between them serves what the previous one stored.
- An image is resolved during the render, so nothing about it is in the key. A card painting one should name what identifies it — `cardKey.entry(entry, hero.url)`, since a replaced upload lands on a new storage key and so a new URL. Unpublishing an image is invisible to the key, so a card already rendered keeps showing it: a purge clears the edge, and the next request reads the same bytes back out of your bucket under an unchanged key. Only a key change replaces a card's bytes.
- Nothing deletes a card's predecessor. Every key change leaves the old object in your bucket, so a site that redesigns often accumulates a generation per redesign. The URL it was served at redirects to the current card rather than answering the bytes it was published with.

## Images in a card

A card paints an image with an `image` node, and the plugin resolves what it points at before anything renders:

```ts
card.forEntryType("post").define({
  key: ({ data }) => cardKey.entry(data.entry, data.entry.title),
  render: ({ data }) => ({
    type: "container",
    className: "card",
    children: [
      {
        type: "image",
        src: data.entry.meta.hero.url,
        width: 1200,
        height: 360,
      },
      { type: "text", text: data.entry.title },
    ],
  }),
});
```

Three sources resolve:

- **Anything in your media library.** Both shapes a media reference's `url` takes work — the bucket's own public URL when your storage has one, and the `/_plumix/media/serve/<id>` route when it does not. Media has to be published, the same condition that route enforces. Reach for `url`, not `thumbnailUrl`: a thumbnail is a URL on your transform CDN, which is fetched rather than stored, so it does not resolve.
- **Anything else in your storage bucket**, addressed by the URL the bucket would mint for it.
- **A `data:` URI**, which passes through untouched — it carries its own bytes, so it stays the escape hatch for a small inline asset such as a logo.

Two things are dropped even after resolving: an object over 8 MB, and one whose stored content type is not an image. Neither is a picture a 1200x630 card wants, and the engine throws on bytes it cannot decode, which would cost the card its whole render rather than one image.

**Anything else is dropped too, and the card renders without it.** An `https://` URL pointing anywhere the plugin cannot resolve through a slot is not fetched, because **no image a card names is ever fetched** — the bytes are resolved before the render, and there is no path from an image node to an outbound request. That removes a class of problem rather than mitigating it: the equivalent Nuxt module has shipped fixes for three separate advisories rooted in a renderer being steerable into fetching attacker-influenced URLs. It also keeps a render deterministic — no network means no timeouts and no half-drawn cards — and keeps the key honest, since a fetched image would be an input the key could not see. If you need a remote image on a card, put it in your media library.

The same discipline runs through the route: **no render option is ever read from the card's URL.** The server derives the size, the format and the key; the URL identifies a card and carries nothing else.

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
