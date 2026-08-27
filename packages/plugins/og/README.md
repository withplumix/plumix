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

The `storage:` slot is where a rendered card is kept; without one, every request renders it again. On a new site `create-plumix-app` writes all of this — the import, the registration, the slot and the bucket binding behind it:

```bash
pnpm create plumix-app my-site --plugins blog,og
```

## What you get

- **A card per page**, at `/_plumix/og/card/<target>/<digest>.<ext>` — PNG by default, and the extension always names what the renderer produces. `<target>` names the page: `entry/12`, `term/3`, `archive/post`, `author/7`, `date/2026-03`, `front-page`. Each is composited from a bundled default template: the page's own title over your site's name. Drop the digest — `/_plumix/og/card/entry/12.png` — and you land on whichever render is current, which is how you open a card by hand.
- **Share a link and the card is what appears.** The entry's page carries the card as its `og:image`, with `og:image:width` and `og:image:height` so a scraper can lay the preview out before it fetches a byte. An entry that has a picture of its own shares the picture instead, cropped to the card's shape — see [which image a page shares](#which-image-a-page-shares).
- **Render once, serve cheaply** — a card is rendered on the first request, written to your storage bucket, and read back after that. A matching `If-None-Match` answers `304`.
- **Cached where your pages are cached.** With a `cache:` slot configured, a card is stored at the edge under the same `e:<id>` tag its entry's pages carry, so the publish that clears the page clears the card with it. The URL carries the card's digest and is served `immutable`: an edit publishes a _different_ URL, which is the only thing that makes X, Facebook and LinkedIn refetch an image they already hold — a purge reaches Cloudflare and stops there.
- **A renderer you can swap.** `renderer:` takes the bundled engine (`takumi()`, or `takumi({ format: "jpeg" })` for a photo-heavy design), the same engine's SVG output (`svgOnly()`), or `remote({ url })` to render off-box.
- **A default card in your theme's colours**, from three `color` tokens it looks for by name — see [the default card's palette](#the-default-cards-palette).
- **Cards your theme designs**, declared beside its templates and styled in its own design tokens — see below.
- **A preview in the editor**, opt-in per entry type, showing what the entry will be shared with and which of the four links produced it — see [preview a card while you write](#preview-a-card-while-you-write).

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

## Preview a card while you write

Name the entry types whose editor should carry it:

```ts
og({ preview: ["post", "page"] });
```

Each named type gains a **Social card** box in the editor rail: the image the
entry will be shared with, a line naming which of the four links above produced
it, and — where there is no card — the reason, in the same words the debug
bar's og panel uses. "I set a featured image and nothing changed" reads back as
_The card steps aside for the featured image_.

The preview renders on request and reads nothing back from storage, so a draft
has one too — which is the point, since a card's URL is addressed by a digest
over what the card read and a draft has no stable one. It also sees through a
pending autosave, so a featured image you picked on an already-published post
shows up before you publish again. A card costs a render, so the box fetches
once and has a **Refresh** button for after you save.

An entry a scraper could never reach — a private type, or one an access policy
gates — gets no card here either, exactly as its page's head gets none.

The list is not defaulted because a meta box is registered against entry types
by name and a name nothing registered fails the boot. Leave `preview` out and
neither the box, the procedure behind it, nor the plugin's admin chunk is
registered at all.

It shows; it does not choose. There is no per-entry override here — the links
above are the one precedence authority, and a fifth control added before
authors can see the outcome would only be a fifth thing to be surprised by.

The card is rendered by whatever `renderer:` names. With `remote({ url })` that
means a draft's title and card content are POSTed to that endpoint on every
preview — your own service, but worth knowing before you point it off-box.

## When a card cannot be advertised

A card reaches a page's head only when the connected renderer produces a format scrapers render — PNG or JPEG, the intersection of what X, Facebook and LinkedIn all document. Anything else still serves its route, so you can build and look at your cards with no rasterizer in play, but the head falls through to the rest of the chain — the entry's own photo, then your site-wide default: an SVG `og:image` unfurls as nothing at all, and WebP unfurls inconsistently, both worse than a picture that works everywhere.

An entry the access layer keeps from an anonymous visitor gets no card either, and its route answers `404`. A card carries the entry's title, sits at a sequential id anyone can walk, and is served from a shared cache, so it is refused on the same terms its page is — asked of a scraper carrying no session, whoever happens to be reading. A _soft_ gate is the exception on purpose: its page serves a public teaser at 200, so the teaser unfurls with a card like any other page.

A render that throws is the same story from the other end: the page already shipped the card's URL and cannot take it back, so the route redirects to your site default and logs what broke rather than answering an error a scraper would render as a hole. In development it stops at the dev error page instead, with the stack.

## The default card's palette

The bundled card paints from three of your theme's `color` tokens: `background` for its ground, `foreground` for the headline, and `muted-foreground` for the site name beneath it. A theme spelling its palette those three ways gets a card in its own colours for declaring nothing at all.

Most themes spell them their own way. Name the roles yours does:

```ts
og({
  palette: { background: "paper", foreground: "ink", mutedForeground: "muted" },
});
```

Each key is a role the card paints and each value is one of your `color` token slugs. A role you leave out keeps the convention name. The keys are camelCase because they are TypeScript; the slugs they default to are kebab-case because that is what `defineTheme` accepts.

The card takes your palette only when **all three** resolve. Name two and it keeps its own three rather than mixing them, because the theme's paper under the bundled card's near-white ink is an unreadable card — worse than one that merely looks unlike the site. A token declared without a `value` does not resolve either, for the reason [below](#your-themes-tokens): a card renders away from the page, where your own stylesheet never loads, so a custom property your CSS defines is one the card cannot read.

Only colour follows the theme. The card's spacing and type sizes are its own, so a `spacing` token changes nothing about it — a card is one fixed 1200×630 composition rather than a page that reflows.

Only the bundled card reads any of this. A card your theme declares styles itself from the same tokens directly, under whatever names it likes.

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

### Which page kinds have a card

Six, each named by an identity a URL can carry:

| Page                   | Target                | Shareable when                                                     |
| ---------------------- | --------------------- | ------------------------------------------------------------------ |
| An entry               | `entry/<id>`          | Published, of a public type, and reachable by an anonymous visitor |
| A term archive         | `term/<id>`           | Its taxonomy has a public archive, and it lists something          |
| A content-type archive | `archive/<type>`      | The type has a public archive, and it lists something              |
| An author archive      | `author/<id>`         | They have published something                                      |
| A date archive         | `date/YYYY[-MM[-DD]]` | Something was published in it                                      |
| The front page         | `front-page`          | Always                                                             |

A listing page that lists nothing answers `404`, the same way a draft entry's card does. Its page still renders — an empty term archive is a real page — but a card is minted at an enumerable URL and kept immutable in your bucket, and that rule is what keeps the calendar from being three million of them, and `author/<id>` from being a walk through your user list on a site where nobody has published yet.

A card names the archive, not one paginated slice of it: `/posts/page/2` advertises the same card `/posts` does, and a card rule for a listing always renders from the archive's first page. So `data.entries` in a listing card is page one, whichever page is being viewed.

An archive whose entry type carries an `access` policy is refused on the same terms its listing page is — asked of a scraper carrying no session, whoever happens to be reading — because a theme card that renders `data.entries` would otherwise put gated titles on a public, immutable, edge-cached URL.

`card.search()` and `card.forArchiveType()` rules type-check and resolve, but neither page has a card: a search page's subject is whatever the visitor typed, and a `registerArchiveType` archive is resolved by its own plugin from route parameters no card URL names.

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

## Building a card

Two surfaces exist only in development. Both are behind the same gate core uses
for its own dev routes (`PLUMIX_DEV`) and a dynamic import, so neither leaves
anything in a production build, and both answer only over loopback: the preview
route is registered `auth: "development"` and the panel rides the debug bar,
which core injects on the same terms. Reviewing on a phone or through a tunnel
means starting the dev server with `PLUMIX_DEV_ALLOW_REMOTE=1`.

**`/_plumix/og/preview`** renders every declared rule against sample data, with
one card per rule at `/_plumix/og/preview/<n>.<ext>`. They are listed in the
order a page resolves against them — every targeted matcher, then the generic
tiers, then `fallback` — which is not the order they were declared in, so the
list reads as the precedence it actually is. Nothing is read from storage and
nothing is cached: a refresh re-renders, so an edit shows up. That bypass is a
requirement rather than a convenience — the URL a card is served at carries its
digest, so every edit publishes a _different_ one and the previous render sits
immutable in your bucket, and without it the authoring loop is copy-pasting
URLs out of page source.

The sample data is invented, never looked up, so the preview works on a site
with no content in it. A rule's matcher contributes the names it narrows on:
`card.forEntryType("recipe")` previews a recipe.

**The debug bar's "OG image" panel** answers the other question. Four links
resolve one `og:image` and the rendered page says nothing about which of them
won, so the panel names it — the explicit role, the featured photo, the card
(and which rule produced it), or your site default — along with the reason
there is no card on the page. That is where a renderer whose format scrapers
cannot read is reported, which is why there is no boot-time warning for it.

The panel reports the chain as this plugin sees it, so a `seo:og_image`
subscriber registered _after_ `og()` in your `plugins:` array can override the
answer without the panel learning; the page's own `og:image` meta tag is the
last word. An explicit `.ogImage()` field short-circuits above the filter, so
the panel names that link but cannot show its value either.

## What the renderer costs

The default renderer is resolved inside this package, so the engine is part of your install whichever implementation you select — roughly 2.3 MB against a Worker size ceiling of 10 MB gzipped on the paid plan, 3 MB on the free one. Selecting `svgOnly()` does **not** give those bytes back: it is the same engine's SVG output. `remote({ url })` is the only implementation that leaves the engine unexecuted, and even then it stays installed.

Rendering one costs CPU, and the Workers **free plan allows 10 ms of it per invocation** — not enough to rasterize a card. The limit applies to scheduled handlers exactly as it does to fetch handlers, so precomputing cards on a cron does not route around it; `remote({ url })`, which renders off-box, is what does.

A free-plan site is not left without share images. The featured-image path above never reaches the renderer: an entry's own photo is cropped to the card's shape by URL math through your `imageDelivery:` slot, so a site whose entries carry photos unfurls correctly with nothing rendered at all. Declare a card rule anyway — it is what says which shape to crop to.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
