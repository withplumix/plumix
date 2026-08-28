# @plumix/plugin-feeds

This Plumix plugin adds **RSS 2.0 and Atom feeds** — the XML a reader subscribes to and an aggregator polls.

Feeds are not a search-engine concern, which is why they are their own package rather than part of `@plumix/plugin-seo`. Core serves no feed of its own: without this plugin a site simply has none.

## Install

```bash
pnpm add @plumix/plugin-feeds
```

Then add it to your `plumix.config.ts`, after the plugin whose entries it syndicates:

```ts
import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { feeds } from "@plumix/plugin-feeds";

export default plumix({
  // …your runtime, database, and auth
  plugins: [blog(), feeds()],
});
```

## What you get

Every path below is RSS 2.0, and Atom at the same path plus `/atom`. Twenty items, newest publish time first.

| Scope          | Path                          |
| -------------- | ----------------------------- |
| Site           | `/feed`                       |
| Entry type     | `/<type>/feed`                |
| Taxonomy term  | `/<taxonomy>/<term>/feed`     |
| Author         | `/authors/<slug>/feed`        |
| Date           | `/YYYY[/MM[/DD]]/feed`        |
| Plugin archive | whatever the archive declares |

Plus a `<link rel="alternate">` pair in the head of every page that has a feed, gap-filled around anything the theme already declared.

The plugin takes no options, adds no database tables and ships no admin screens.

## Adjusting the items

`feed:items` runs over the collected list before serialization, with the scope it was collected for:

```ts
import { definePlugin } from "plumix/plugin";

import "@plumix/plugin-feeds";

export const featured = definePlugin("featured", {
  setup: (ctx) => {
    ctx.addFilter("feed:items", (items, scope) =>
      scope.kind === "site" ? items.slice(0, 5) : items,
    );
  },
});
```

## Syndicating a plugin archive

`registerArchiveType` gains an optional `feed` from this package's type augmentation. `routes` are the paths it answers — declare the base route only and end it in `/feed`, the `/atom` variant comes with it — and `filter` returns the SQL row predicate, or `null` for a 404:

```ts
ctx.registerArchiveType("event-series", {
  routes: ["/events/:series"],
  resolve: (_ctx, params) => ({
    data: { kind: "custom", name: "event-series" },
    title: `Series: ${params.series}`,
  }),
  feed: {
    routes: ["/events/:series/feed"],
    filter: (_ctx, _params) =>
      and(eq(entries.type, "event"), eq(entries.status, "published")) ?? null,
  },
});
```

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
