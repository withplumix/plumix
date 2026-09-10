---
"plumix": patch
---

Declares freshness on the two `/_plumix/` surfaces that sent none. RPC responses
carried no `cache-control` at all, so a shared cache in front of the site
decided for them from an absent header — and since a `SameSite=Lax` session
cookie rides a top-level navigation, a URL an attacker gets a signed-in victim
to visit could have its private JSON stored under a key any visitor reaches.
Every RPC response now says `private, no-store`.

The RPC branch also accepts `POST` only, answering `405` with `Allow: POST`
otherwise. oRPC reads a `GET`'s input from `?data=`, and while its handler
rejects a `GET` by default, a procedure declaring `route: { method: "GET" }`
opts itself back out — a plugin router could reopen the shape. The method the
surface accepts is now the dispatcher's decision rather than each procedure's.
Nothing shipped issues a non-`POST` RPC call: both the admin client and the
theme's `useAuth` probe `POST`.

On the REST side, only PAT-authed reads declared anything. Anonymous
`/_plumix/api/v1/**` reads and the OpenAPI document now declare `no-store` too:
nothing on that surface carries a cache tag, so a shared copy of it could never
be purged when the content behind it changes. Operators fronting the public read
API with a CDN will see it stop being stored.
