# @plumix/plugin-seo

This Plumix plugin writes what a site tells a search engine — the **head meta** a public page needs (a description, a robots directive, the Open Graph set, the Twitter card, and the resolved social image), its **structured data**, plus **`/robots.txt`**, the **sitemap**, and a **per-entry and per-term box** where an editor overrides any of it. Core emits a canonical URL and nothing else, so without this plugin a page carries none of them and the site serves neither endpoint.

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

- **A description and a robots directive** — the entry's excerpt falling back to the site tagline, and a directive decided by the assertion chain below.
- **The Open Graph set** — `og:title`, `og:type`, `og:url`, `og:site_name`, `og:description`, `og:locale`, plus `article:published_time`, `article:modified_time` and `article:author` on a single entry.
- **The Twitter card** — `summary_large_image` when a social image resolved, `summary` when none did.
- **The `og:image` chain** — the entry's explicit `.ogImage()` choice, then the SEO box's own social image URL, then whatever a `seo:og_image` subscriber supplies, then the entry's `.featured()` photo, then the site-wide default. The order is fixed, so a generated card never outranks a deliberate choice.
- **A JSON-LD graph** on every indexable page — website, publisher, page, article, breadcrumbs, image and author, cross-referenced by URL fragment so the pieces point at each other instead of repeating themselves. Identifiers derive from the canonical URL, so two renders of one URL produce the same graph. Three filters take it apart: `seo:schema:needs` drops a piece, `seo:schema:piece` reshapes one, `seo:schema:graph` replaces the lot. Serialization is this plugin's, escapes included, so a hostile title cannot close the script element.
- **Breadcrumbs** — a `BreadcrumbList` in the graph and a `<Breadcrumbs data={data} />` component a theme renders, both built from one trail, so the page and the search result cannot disagree.
- **A per-entry and per-term SEO box** on every publicly-visible entry type and taxonomy — a search title, a search description, a canonical override, a social image, `noindex` / `nofollow` flags, and (on entries) the schema.org type of the article piece, stored under `seo_`-prefixed meta keys and saved with the entity's own Save. Exclude a type with `seo({ metaBox: { exclude: ["landing_page"] } })`.
- **One indexability predicate** behind the robots directive, with the sitemap asking the same questions of whole tables — so a page marked `noindex` cannot still appear in the sitemap. It is an ordered set of named assertions that short-circuits on the first that fires: `site_private`, `entry_override`, `type_default`, `taxonomy_default`, `search_results`, `paginated`, `not_found`, then `default`. It reports which one answered rather than a bare boolean.
- **Per-type title patterns** — a line of `%%variables%%` (`title`, `sitename`, `sep`, `term`, `author`, `date`, `searchphrase`, `count`) set per entry type, with a site-wide default for everything else. An entry's own search title outranks both, an empty variable is dropped along with any separator left holding nothing together, and an unknown name is dropped rather than shipped into a search result.
- **Per-type and per-taxonomy indexing defaults**, so a whole class of content leaves both the index and the sitemap at once; plus toggles for the three arms that are off by default — search results, paginated archives and pages that were not found.
- **`/robots.txt`** — allow-all while indexing is on, disallow-all when it is off, adjustable through the `seo:robots-txt` filter. Turning **Block AI crawlers** on adds one group disallowing the crawlers that feed model training and assistant answers, leaving ordinary search crawlers alone.
- **The sitemap** — `/sitemap.xml` indexing one `/sitemap-<scope>-<page>.xml` per public entry type, taxonomy and registered archive, paged at 1,000 URLs, published entries only, adjustable through the `seo:sitemap:urls` filter. Responses carry cache headers and per-scope purge tags, so publishing an entry retires that scope alone. An entry's `.featured()` and `.ogImage()` pictures ride its `<url>` as image entries — images only, absolutized, at most ten per URL, resolved in one batched pass per page — and every document names `/sitemap.xsl` so it reads as a table in a browser that still runs XSLT, and as XML to a crawler.
- **`/llms.txt`** — the llmstxt.org convention: the site name, its tagline and a link to the sitemap, adjustable through the `seo:llms-txt` filter. A site held out of the index, or one blocking AI crawlers, is served the heading without the map.
- **IndexNow notification** — set a key and publishing or updating an entry submits its URL to the shared endpoint, so a change is picked up in minutes rather than at the next crawl. One submission per entry per request, deferred past the response and swallowing every failure, so an unreachable endpoint is a missed notification and not a failed publish. Off until a key is set.
- **A settings group** — the site-wide indexing toggle (which drives the robots directive on every page, `robots.txt`, the sitemap and the `llms.txt` map), the default social image, whether the site represents an organization or a person, the AI-crawler toggle and the IndexNow key, on a settings page of its own.

Every tag is gap-filled: it is appended only when nothing has already set that key. The contribution runs last on the `render:document` chain whatever order the `plugins` array is in, so a theme's own head tags keep winning — and so do another plugin's.

`@plumix/plugin-og` contributes one link of the chain above and needs this plugin installed to reach a page's head.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
