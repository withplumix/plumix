---
"@plumix/runtime-node": patch
---

Trims the Node runtime's published surface before its first release. `IMAGE_ROUTE`, `createScheduler` and the wide `NodeImageDelivery` shape are no longer exported: each was reachable inside the package through a relative import and had no consumer outside it. `NodeImageDelivery` in particular published `sharp()`, the variant cache and the resolved config on top of what core's `ImageDelivery` port needs.

Also corrects the README, which described the default export and `listener` as the same site. They do not serve the same paths: `listener` runs the assets and image layers ahead of the site, while the default export runs neither, so `/assets/*`, `/_plumix/image` and the admin's own `/_plumix/admin/assets/*` go unserved — a host mounting it gets the admin shell back, but its chunks 404.
