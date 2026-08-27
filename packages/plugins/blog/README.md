# @plumix/plugin-blog

This Plumix plugin adds a **blog** to your site — a `post` entry type with categories and tags, revisions, and autosave out of the box.

## Install

```bash
pnpm add @plumix/plugin-blog
```

Then drop it into your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";

export default plumix({
  // …your runtime, database, and auth
  plugins: [blog()],
});
```

## What you get

- **`post` entry type** — title, block editor, excerpt, revisions (up to 25), and 60-second autosave.
- **`category` taxonomy** — hierarchical, for grouping posts.
- **`tag` taxonomy** — flat, for lightweight labels.
- **Related posts** — a `relatedPosts` template dependency your theme can render, matched by shared categories and tags.

No extra migrations — add the plugin and the post editor shows up in the admin.

## Reshaping what it registers

`blog()` takes an override per registration. Each is a partial of the options the plugin passes to `registerEntryType` / `registerTermTaxonomy`, so anything those accept can be changed and anything omitted keeps the default:

```ts
blog({
  post: {
    rewrite: { slug: "insights" },
    hasArchive: true,
    archivePerPage: 4,
  },
});
```

Object-valued options (`labels`, `rewrite`, `versioning`) merge key by key; arrays and plain values replace, or compose via `(prev) => next`. Passing `false` — `blog({ tag: false })` — skips a registration and drops it from the post type's `termTaxonomies`.

The registered names (`post`, `category`, `tag`) are fixed: they are the stored `type`/`taxonomy` column values and the keys a theme's `forEntryType("post")` matches on.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
