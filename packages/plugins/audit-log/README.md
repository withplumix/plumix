# @plumix/plugin-audit-log

This Plumix plugin records **who did what** — an activity feed of entry, user, term, and settings events, queryable from the admin.

## Install

```bash
pnpm add @plumix/plugin-audit-log
```

Then add it to your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { auditLog } from "@plumix/plugin-audit-log";

export default plumix({
  // …your runtime, database, and auth
  plugins: [auditLog()],
});
```

The plugin ships a database table. Regenerate migrations after adding it:

```bash
plumix migrate generate
```

## What you get

- **An `/audit-log` admin page** (under Tools) — a paginated, filterable feed, gated behind an `audit_log:read` capability.
- **Automatic capture** — subscribes to entry, user, term, and settings lifecycle events; no wiring needed.
- **A retention purge** — a daily scheduled task trims old rows (90 days by default).
- **`ctx.audit.log(ctx, ...)`** — record your own events. The row is attributed to the user on the context you pass, so it takes an `AuthenticatedAppContext`, which is what an authenticated procedure or route already holds:

  ```ts
  ctx.audit?.log(ctx, {
    event: "widget.published",
    subject: { type: "widget", id },
    properties: { name },
  });
  ```

  A hook listener gets a plain `AppContext` whose `user` may be null, and checking the property does not narrow the object, so pin the user on a copy:

  ```ts
  if (!appCtx.user) return;
  appCtx.audit?.log({ ...appCtx, user: appCtx.user }, { event, subject });
  ```

## Configuration

```ts
auditLog({
  // Keep entries for 90 days (the default), or pass `false` to keep forever.
  retention: { maxAgeDays: 90 },
  // Optional custom storage seam; defaults to the SQLite table.
  // storage: sqlite(),
});
```

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
