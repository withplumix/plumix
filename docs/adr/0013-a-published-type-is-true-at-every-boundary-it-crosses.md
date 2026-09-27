# A published type is true at every boundary it crosses

`@plumix/plugin-comments` publishes `ResolvedComment`, whose `createdAt` is a
`Date`. That holds everywhere the plugin hands one over except one place. The
`comments` template dep never serializes it, and island props go through the
Astro-port prop codec, which carries `Date`. The public
`GET /_plumix/comments/list` route answers with a bare `JSON.stringify`, so a
theme paging in older comments received `createdAt` as an ISO string under a
type that said `Date`. A theme that typed its load-more JSON as
`ResolvedComment` crashed on `createdAt.getTime()` (#2485). The reference theme
also built the route's URL by hand, which 404s on a subdirectory mount.

> **A type a package publishes is true wherever a caller receives it. Where a
> value crosses a boundary that loses information — a plain JSON route — the
> package's wire module decodes the payload and restores the published type
> before handing it on. The package publishes neither a second, wire-shaped
> copy of the type nor the route's path; its published browser surface is a
> hook.**

For comments, the wire module's `fetchCommentPage` decodes the list route's
answer with valibot, reviving each `createdAt` as a `Date`. It builds the URL
under the deployment's base path. `usePlumixCommentThread`, published from
`@plumix/plugin-comments/hooks`, is how a theme island calls it.

## Considered options

- **A separate browser type with `createdAt: string`** (rejected). It tells
  the truth about the wire, but it gives one concept two shapes forever. A
  theme could no longer render a server-side comment and a loaded one with the
  same item component.
- **Publishing `fetchCommentPage` and `LIST_PATH`** (rejected). A published
  path invites hand-built URLs, which is exactly the playground's base-path
  bug. The hook keeps URL construction inside the package.
- **The plugin rendering the thread** (rejected). Thread markup is the theme's,
  through the `comments` template dep. The plugin owns the _form_ markup only
  because a refused comment must come back with the visitor's words in it, and
  nothing like that applies to reading a thread.
- **An island owning the whole thread** (rejected). Its props would
  re-serialize the first page, roughly doubling the section's HTML. The first
  page stays server-rendered, and the island holds only what it loaded.

## Consequences

- The rule is stated repo-wide and applied here to comments only. Other
  plain JSON routes meet it when they are next touched.
- oRPC routes already preserve `Date` across the wire, so the rule bites only
  on plain JSON routes.
- A theme's thread is two `<ul>`s in the DOM: the server-rendered first page
  and the island's loaded pages. That is the accepted cost of rendering each
  comment once, with no duplicated markup and no re-serialized first page.
