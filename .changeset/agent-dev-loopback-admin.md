---
"plumix": minor
---

Lets a local agent use `plumix dev` without a token: an MCP request over loopback with no token acts as the site's first admin, and its revisions show "dev (loopback)" as the token. A loopback request that carries a token acts as that token's person, as in production. A cross-origin request is still refused, and a production build has no such path.
