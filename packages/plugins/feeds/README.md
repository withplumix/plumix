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

| Scope          | Path                      |
| -------------- | ------------------------- |
| Site           | `/feed`                   |
| Entry type     | `/<type>/feed`            |
| Taxonomy term  | `/<taxonomy>/<term>/feed` |
| Author         | `/authors/<slug>/feed`    |
| Date           | `/YYYY[/MM[/DD]]/feed`    |
| Plugin archive | `<archive route>/feed`    |

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

`registerArchiveType` gains an optional `feed` from this package's type augmentation. Each archive route gets a feed at `<route>/feed`, with Atom at `/feed/atom`, and every page of the archive advertises it. `scope` narrows the entries the feed carries — or answers `null` for a 404 and no advertisement:

```ts
ctx.registerArchiveType("event-series", {
  routes: ["/events/:series", `/events/:series${FRAMEWORK_PAGINATION_SUFFIX}`],
  resolve: (_ctx, params) => ({
    data: { kind: "custom", name: "event-series" },
    title: `Series: ${params.series}`,
  }),
  feed: {
    scope: (q, params) =>
      q.ofTypes("event").inTerm("event-series", params.series ?? ""),
  },
});
```

The query arrives restricted to published entries of public types, and every method on it adds a condition. There is no method that removes one, so an archive can say less than it meant to without its feed showing more than it should — the visibility rule is this plugin's, not yours to remember. `ofTypes`, `inTerm`, `byAuthor`, `inDateRange` and `under` cover the shapes an archive usually models; `where(sql)` ANDs on an arbitrary predicate for the ones they do not, and cannot widen the feed either — built with the `sql` template, not `sql.raw`.

`q.none()` is a feed that exists and is empty, which is not the same answer as `null`.

A `scope` records what to narrow by rather than resolving it, so declaring one costs no queries. That matters because every page of the archive asks the same question to decide whether to advertise its feed.

An archive declaring an `access` policy gets no feed. A feed is a public route, which core answers ahead of the access gate, so serving one would hand a policied archive's entries to any anonymous reader.

A route ending in `FRAMEWORK_PAGINATION_SUFFIX` (from `plumix/plugin`) gets no feed of its own; its pages advertise the feed of the route they paginate.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
