---
"plumix": minor
---

Removes `entryRoleImage` (breaking). An entity's role image is read off the entity: `entry.images.ogImage`, `entry.images.featured`, and any role a plugin or theme registered. A caller holding raw stored `meta` bags instead of resolved entities uses `resolveImageRoles(ctx, scope, bags)`, which batches the whole page into one hydration per reference group. Both have shipped since 0.22; this release drops the walk they replaced, which could not see a role field nested in a group.
