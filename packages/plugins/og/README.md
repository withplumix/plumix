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
