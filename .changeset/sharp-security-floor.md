---
"@plumix/runtime-node": patch
"create-plumix-app": patch
---

Raises the `sharp` floor to `0.35.4`, which carries the libheif fixes for
GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545. `@plumix/runtime-node` declares
`sharp` as an optional peer, so a project on `0.35.3` will see an unmet peer
until it upgrades — that is the intended signal. Scaffolded projects that
select the Node runtime's `imageDelivery` capability install the patched line
from the start.
