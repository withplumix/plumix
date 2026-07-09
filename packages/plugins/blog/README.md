# @plumix/plugin-blog

This Plumix plugin adds a **blog** to your site — a `post` entry type with categories and tags, revisions, and autosave out of the box.

## Install

```bash
pnpm add @plumix/plugin-blog
```

Then drop it into your `plumix.config.ts`. `blog` is a ready-made plugin, so you add it as-is (no call needed):

```ts
import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";

export default plumix({
  // …your runtime, database, and auth
  plugins: [blog],
});
```

## What you get

- **`post` entry type** — title, block editor, excerpt, revisions (up to 25), and 60-second autosave.
- **`category` taxonomy** — hierarchical, for grouping posts.
- **`tag` taxonomy** — flat, for lightweight labels.
- **Related posts** — a `relatedPosts` template dependency your theme can render, matched by shared categories and tags.

No configuration and no extra migrations — add the plugin and the post editor shows up in the admin.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
