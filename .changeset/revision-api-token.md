---
"plumix": minor
---

Adds the API token that made a change to its revision: the person stays the author, the revision records the token's id and name as they were at the time, and the admin's revision list shows "Ada via Claude Desktop". `ctx.apiToken` carries the token a request authenticated with (`null` otherwise), and a custom authenticator returning an `"api-token"` result must now include `apiToken: { id, name }`.
