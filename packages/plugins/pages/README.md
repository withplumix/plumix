# @plumix/plugin-pages

This Plumix plugin adds **hierarchical static pages** — the "About", "Contact", and nested-docs kind of content that isn't a blog post.

## Install

```bash
pnpm add @plumix/plugin-pages
```

Then add it to your `plumix.config.ts`. `pages` is a factory, so you call it:

```ts
import { plumix } from "plumix";

import { pages } from "@plumix/plugin-pages";

export default plumix({
  // …your runtime, database, and auth
  plugins: [pages()],
});
```

## What you get

- **`page` entry type** — title, block editor, slug, and excerpt.
- **Hierarchy** — pages can nest under a parent, so `/docs/getting-started` is just a page under `/docs`.
- **Revisions & autosave** — up to 25 revisions and 60-second autosave, same as posts.

No configuration and no extra migrations — add the plugin and the page editor shows up in the admin.

## Reshaping what it registers

`pages()` takes an override for the `page` type. It is a partial of the options the plugin passes to `registerEntryType`, so anything that accepts can be changed and anything omitted keeps the default:

```ts
pages({
  page: {
    rewrite: { slug: "p" },
  },
});
```

Object-valued options (`labels`, `rewrite`, `versioning`) merge key by key; arrays and plain values replace, or compose via `(prev) => next`. Passing `false` — `pages({ page: false })` — skips the registration.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
