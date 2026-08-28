# @plumix/plugin-seo

This Plumix plugin writes the **head meta** a public page needs — a description, a robots directive, the Open Graph set, the Twitter card, and the resolved social image. Core emits a canonical URL and nothing else, so without this plugin a page carries none of them.

## Install

```bash
pnpm add @plumix/plugin-seo
```

Then add it to your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { seo } from "@plumix/plugin-seo";

export default plumix({
  // …your runtime, database, and auth
  plugins: [seo()],
});
```

## What you get

- **A description and a robots directive** — the entry's excerpt falling back to the site tagline, and `index,follow,max-image-preview:large` unless the page is search results (`noindex,follow`) or the site is held out of the index entirely (`noindex,nofollow`).
- **The Open Graph set** — `og:title`, `og:type`, `og:url`, `og:site_name`, `og:description`, `og:locale`, plus `article:published_time`, `article:modified_time` and `article:author` on a single entry.
- **The Twitter card** — `summary_large_image` when a social image resolved, `summary` when none did.
- **The `og:image` chain** — the entry's explicit `.ogImage()` choice, then whatever a `seo:og_image` subscriber supplies, then the entry's `.featured()` photo, then the site-wide default. The order is fixed, so a generated card never outranks a deliberate choice.
- **A settings group** — the site-wide indexing toggle (which drives the robots directive on every page) and the default social image, on a settings page of its own.

Every tag is gap-filled: it is appended only when nothing has already set that key. The contribution runs last on the `render:document` chain whatever order the `plugins` array is in, so a theme's own head tags keep winning — and so do another plugin's.

`@plumix/plugin-og` contributes one link of the chain above and needs this plugin installed to reach a page's head.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
