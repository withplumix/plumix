---
"plumix": minor
---

Gives `ctx.user` one shape on every surface: `{ id, email, name, avatarUrl, role, meta }`, with `name` and `avatarUrl` `null` when the user never set them. RPC procedures, REST resources and MCP tools now see `name` and `avatarUrl` too, plugin routes now see `avatarUrl`, and a public render or public route no longer receives the whole user row, so other columns such as `slug`, `createdAt` or `disabledAt` are gone from `ctx.user` and `useUser()`. `AuthenticatedUser` and `RendererUser` mark `name` and `avatarUrl` as required and nullable, so code that builds one must now set both.
