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

A feed beside every archive, carrying the entries that archive's page lists. Every path below is RSS 2.0, and Atom at the same path plus `/atom`. Twenty items, newest publish time first whatever order the page lists them in.

| Archive        | Path                      |
| -------------- | ------------------------- |
| Front page     | `/feed`                   |
| Entry type     | `/<archive slug>/feed`    |
| Taxonomy term  | `/<taxonomy>/<term>/feed` |
| Author         | `/authors/<slug>/feed`    |
| Date           | `/YYYY[/MM[/DD]]/feed`    |
| Plugin archive | `<archive route>/feed`    |

A type's feed sits beside its archive page, at its `hasArchive` slug; a type with no archive page has no feed. The front page, author and date feeds leave hierarchical types out, as their pages do.

Plus a `<link rel="alternate">` pair in the head of every archive page, pointing at that archive's feed and gap-filled around anything the theme already declared. A single entry and the search page advertise none.

The plugin takes no options, adds no database tables and ships no admin screens.

## Adjusting the items

`feed:items` runs over the collected list before serialization, with the archive it was collected for (`scope.archive`, as core's archive lookup names it, and the `scope.params` its route captured):

```ts
import { definePlugin } from "plumix/plugin";

import "@plumix/plugin-feeds";

export const featured = definePlugin("featured", {
  setup: (ctx) => {
    ctx.addFilter("feed:items", (items, scope) =>
      scope.archive.kind === "front-page" ? items.slice(0, 5) : items,
    );
  },
});
```

## Syndicating a plugin archive

`registerArchiveType` gains an optional `feed` from this package's type augmentation, accepted only beside `entries`. The feed is the archive's own entry query, so there is nothing else to declare:

```ts
ctx.registerArchiveType("event-series", {
  routes: ["/events/:series"],
  entries: (q, params) =>
    q.ofTypes("event").inTerm("event-series", params.series ?? ""),
  title: (params) => `Series: ${params.series ?? ""}`,
  feed: true,
});
```

Each archive route gets a feed at `<route>/feed`, with Atom at `/feed/atom`, and every page of the archive advertises it — a later page advertising the feed of the route it paginates. Params `entries` answers `null` for 404 the page and the feed together.

`feed` is `true`, or an object reserved for feed-only options (none yet).

An archive declaring an `access` policy gets no feed. A feed is a public route, which core answers ahead of the access gate, so serving one would hand a policied archive's entries to any anonymous reader.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
