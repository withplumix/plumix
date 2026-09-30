# A plugin REST resource's `{collection}` and `{entry}` segments are bound by core

`GET /_plumix/api/v1/{type}/{id}/comments` never read its first segment
(#2765). The comments handler checked the id and served the thread, so
`/posts/5/comments`, `/pages/5/comments` and `/bogus/5/comments` all answered
with the same comments. Core's own `GET /{collection}/{id}` already refused an
id whose entry is of another type, with the same hidden 404 as a missing one.
A plugin resource got nothing comparable: its handler received `{ input,
context }` and had to parse and check both segments itself. That is how the bug
got in, and every plugin that addresses an entry by URL would have to get the
same check right again.

> **Core binds two reserved path segments on a plugin REST resource.
> `{collection}` resolves to a public entry type through the resolver core's
> own collection routes use. `{entry}` resolves to an entry the requesting
> principal may read, scoped to that entry type when the path has both.
> Every way either fails answers core's `NOT_FOUND` and the handler never runs.
> The handler receives `entryType` and `entry`, typed from the path literal.**

## What this means

- **Implicit, by reserved name.** A resource opts in by naming the segment
  `{collection}` or `{entry}` in its `path`; there is no `bind:` option.
  `{collection}` is the name core's own routes give that segment
  (`rest/router.ts`) and `{entry}` is the GLOSSARY's word for what it names, so
  a path that says `{entry}` and receives something other than an entry would
  be the surprise. A plugin that wants a raw id names the segment anything else.
- **Scoped, with one answer.** When the path has both segments, the entry must
  be of the collection's type. A missing entry, an unreadable one, one of
  another type, and an id that isn't a positive integer all answer the same
  `NOT_FOUND`, so nothing tells a stranger which ids exist.
- **Bound means readable by the requester.** Binding uses core's entry-read
  rule (`findReadableEntry`) for the principal on the request, after the
  resource's `auth` gate. A gated resource still answers
  `UNAUTHORIZED`/`FORBIDDEN` before it can reveal a 404. Anything past "may
  this requester read this entry", such as whether the entry takes comments,
  stays with the plugin. The handler gets core's `errors`, so its refusal
  answers in core's shape.
- **`input` is the resource's own.** The bound segments join the input schema
  so the router matches them and `openapi.json` documents them as path
  params, then leave `input` before the handler sees it.

## Considered options

- **An explicit `bind: { collection: "entryType", entry: "entry" }` map.**
  More flexible about names, but it is one more thing a plugin author has to
  remember, and forgetting it reproduces #2765 exactly. The reserved names
  cost nothing to opt into.
- **Hand the handler the raw segments and a helper to check them.** The
  comparison stays at every call site, which is where it was missed.
- **Bind taxonomies and terms (`{taxonomy}`, `{term}`) now.** The reserved-name
  design leaves room for them. No consumer needs them yet.

## Prior art

- **Laravel** implicit route-model binding resolves a `{post}` route segment to
  the model by name, and scoped bindings (`/users/{user}/posts/{post}` with
  `scopeBindings()`) require the child to belong to the parent, answering 404
  otherwise.
- **WordPress** REST controllers check the post type themselves in each
  `get_item` (`WP_REST_Posts_Controller::get_post` compares `post_type`), which
  is the per-controller repetition this decision avoids.
