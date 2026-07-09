# @plumix/plugin-comments

This Plumix plugin adds **threaded, moderated comments** to your entries — with a moderation queue, nesting, rate limiting, and email notifications.

## Install

```bash
pnpm add @plumix/plugin-comments
```

Then add it to your `plumix.config.ts` and pick which entry types accept comments:

```ts
import { plumix } from "plumix";

import { comments } from "@plumix/plugin-comments";

export default plumix({
  // …your runtime, database, and auth
  plugins: [comments({ entryTypes: ["post"] })],
});
```

The plugin ships a database table. Regenerate migrations after adding it:

```bash
plumix migrate generate
```

## What you get

- **A `/comments` moderation page** (under Content) — approve, mark spam, or trash, gated behind a `comment:moderate` capability.
- **Public endpoints** — `POST /_plumix/comments/submit` and `GET /_plumix/comments/list`, plus a `{type}/{id}/comments` REST resource.
- **A `comments` template dependency** your theme renders for the current entry.
- **Moderation hooks** — `comment:moderate` (trust policy) and `comment:created` (notify).

## Configuration

```ts
comments({
  entryTypes: ["post"], // types that accept comments
  mode: "first_time", // "all" | "first_time" | "none" — when to hold for review
  maxDepth: 3, // reply nesting depth
  rootsPerPage: 20, // roots per page
  requireEmail: true, // require an author email
  closeAfterDays: null, // auto-close threads after N days
  notifyEmail: "you@example.com", // moderator address for pending comments
  rateLimit: { max: 5, windowMin: 10 }, // per-author submission limit
});
```

Notifications use the top-level `mailer` from your Plumix config.

## Rendering in a theme

Load a thread without pulling in admin code via the `/server` entry:

```ts
import { loadThread } from "@plumix/plugin-comments/server";

const thread = await loadThread(ctx, { type: "post", id });
```

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
